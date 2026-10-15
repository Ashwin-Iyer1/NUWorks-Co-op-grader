#!/usr/bin/env node
/** Score frozen resume/job pairs with the actual Transformers.js tokenizer/pipeline.
 * Node CPU backend; this is not a claim of bit-for-bit browser WASM parity.
 * Input: {resumes:[{id,text}],jobs:[{id,text}],pairs:[{id,dataset,resume_id,job_id}]}.
 * Rows preserve input order inside each dataset/resume job list. A q8 job cannot
 * be cached across arbitrary batches: dynamic quantization depends on its peers.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');

export function loadRuntimeHelpers(ref = 'chrome-extension', root = ROOT) {
  const read = (name) => execFileSync('git', ['show', `${ref}:src/${name}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const source = read('embeddings.js');
  const worker = read('embeddings-worker.js');
  const caller = read('custom.js');
  const extract = (name) => {
    const match = source.match(new RegExp(`export function ${name}\\([\\s\\S]*?(?=\\n/\\*\\*)`));
    if (!match) throw new Error(`Cannot extract exact runtime helper ${name} from ${ref}`);
    return match[0].replace(/^export /, '');
  };
  const helperSource = `${extract('htmlToText')}\n${extract('chunkText')}\n({htmlToText,chunkText})`;
  const helpers = vm.runInNewContext(helperSource, {}, { timeout: 1000 });
  const scoringCaller = caller.slice(caller.indexOf('async function semanticRefine('));
  const batchMatch = scoringCaller.match(/const BATCH = (\d+);/);
  const capMatch = worker.match(/const charCap = msg\.charCap \|\| (\d+);/);
  if (!batchMatch || !capMatch || !worker.includes('pooling: "mean"')
      || !worker.includes('chunkText(htmlToText(msg.resumeText))')) {
    throw new Error('Runtime worker contract changed; review preprocessing before benchmarking');
  }
  return { ...helpers, defaults: { jobBatchSize: Number(batchMatch[1]), charCap: Number(capMatch[1]) },
    provenance: {
      ref, commit: execFileSync('git', ['rev-parse', ref], { cwd: root, encoding: 'utf8' }).trim(),
      embeddings_sha256: digest(source), worker_sha256: digest(worker), caller_sha256: digest(caller),
      helper_source_sha256: digest(helperSource),
    } };
}

export function resumeVector(embedding) {
  const count = embedding.dims[0];
  const dimension = embedding.dims[embedding.dims.length - 1];
  const vector = new Float32Array(dimension);
  // Deliberately use Float32Array compound assignments, just like the worker.
  for (let chunk = 0; chunk < count; chunk++) {
    for (let i = 0; i < dimension; i++) vector[i] += embedding.data[chunk * dimension + i];
  }
  let norm = 0;
  for (let i = 0; i < dimension; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dimension; i++) vector[i] /= norm;
  return vector;
}

export async function scoreInput(input, extractor, helpers, options = {}) {
  const jobBatchSize = options.jobBatchSize ?? helpers.defaults.jobBatchSize;
  const charCap = options.charCap ?? helpers.defaults.charCap;
  if (!Number.isInteger(jobBatchSize) || jobBatchSize < 1 || !Number.isInteger(charCap) || charCap < 1) {
    throw new Error('jobBatchSize and charCap must be positive integers');
  }
  const indexed = (rows, label) => {
    const map = new Map();
    for (const row of rows ?? []) {
      if (typeof row.id !== 'string' || !row.id || typeof row.text !== 'string') throw new Error(`Invalid ${label}`);
      if (map.has(row.id)) throw new Error(`Duplicate ${label} ID: ${row.id}`);
      map.set(row.id, row.text);
    }
    return map;
  };
  const resumes = indexed(input.resumes, 'resume');
  const jobs = indexed(input.jobs, 'job');
  const groups = new Map();
  const pairIds = new Set();
  for (const pair of input.pairs ?? []) {
    if (typeof pair.id !== 'string' || !pair.id) throw new Error('Every pair requires a nonempty string ID');
    if (pairIds.has(pair.id)) throw new Error(`Duplicate pair ID: ${pair.id}`);
    pairIds.add(pair.id);
    if (!resumes.has(pair.resume_id) || !jobs.has(pair.job_id)) throw new Error('Pair references unknown text ID');
    const groupKey = JSON.stringify([pair.dataset ?? 'dataset', pair.resume_id]);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(pair);
  }
  if (!pairIds.size) throw new Error('Input has no pairs');
  const vectors = new Map();
  const batchCache = new Map();
  const scores = [];
  let resumeCalls = 0, jobCalls = 0, encodedChunks = 0, encodedJobs = 0, groupIndex = 0;
  for (const pairs of groups.values()) {
    const resumeId = pairs[0].resume_id;
    if (!vectors.has(resumeId)) {
      const chunks = helpers.chunkText(helpers.htmlToText(resumes.get(resumeId)));
      // The worker embeds one resume's entire chunk array in a single call.
      const encoded = await extractor(chunks, { pooling: 'mean', normalize: true });
      vectors.set(resumeId, resumeVector(encoded));
      resumeCalls++; encodedChunks += chunks.length;
    }
    const vector = vectors.get(resumeId);
    for (let start = 0; start < pairs.length; start += jobBatchSize) {
      const batch = pairs.slice(start, start + jobBatchSize);
      const cleaned = batch.map((pair) => helpers.htmlToText(jobs.get(pair.job_id)).slice(0, charCap));
      const key = JSON.stringify(cleaned);
      let output = batchCache.get(key);
      if (!output) {
        output = await extractor(cleaned, { pooling: 'mean', normalize: true });
        jobCalls++; encodedJobs += cleaned.length;
        // Only identical ordered full batches can safely reuse q8 embeddings.
        if (batchCache.size >= 256) batchCache.delete(batchCache.keys().next().value);
        batchCache.set(key, output);
      }
      const dimension = output.dims[output.dims.length - 1];
      if (dimension !== vector.length) throw new Error('Resume/job embedding dimension mismatch');
      for (let row = 0; row < batch.length; row++) {
        let cosine = 0;
        for (let col = 0; col < dimension; col++) cosine += vector[col] * output.data[row * dimension + col];
        if (!Number.isFinite(cosine)) throw new Error('Non-finite model score');
        scores.push({ id: batch[row].id, prediction: cosine });
      }
    }
    groupIndex++;
    if (options.onProgress) options.onProgress(groupIndex, groups.size);
  }
  return { scores, counts: { pairs: scores.length, resumes: vectors.size, resume_pipeline_calls: resumeCalls,
    job_pipeline_calls: jobCalls, encoded_resume_chunks: encodedChunks, encoded_jobs: encodedJobs },
    inference: { pooling: 'mean', query_prompt: '', resume_chunk_chars: 1100, job_char_cap: charCap,
      job_batch_size: jobBatchSize, resume_batching: 'all chunks of one resume per pipeline call',
      job_batch_order: 'input row order within dataset and resume',
      cache_policy: 'identical ordered complete job batches only' } };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--') || argv[index + 1] === undefined) throw new Error('Expected --key value arguments');
    args[argv[index].slice(2)] = argv[index + 1];
  }
  for (const required of ['model', 'input', 'output']) if (!args[required]) throw new Error(`Missing --${required}`);
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const helpers = loadRuntimeHelpers(args['runtime-ref'] ?? 'chrome-extension');
  const inputText = fs.readFileSync(args.input, 'utf8');
  const input = JSON.parse(inputText);
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  const modelPath = path.resolve(args.model).replaceAll('\\', '/') + '/';
  const threads = Number(args.threads ?? 4);
  if (!Number.isInteger(threads) || threads < 1) throw new Error('threads must be a positive integer');
  const extractor = await pipeline('feature-extraction', modelPath, {
    dtype: 'q8', device: 'cpu', use_external_data_format: false,
    session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 },
  });
  try {
    if (extractor.tokenizer.model_max_length !== 256) {
      throw new Error(`Expected saved 256-token cap; got ${extractor.tokenizer.model_max_length}`);
    }
    const started = performance.now();
    const result = await scoreInput(input, extractor, helpers, {
      jobBatchSize: args['job-batch-size'] ? Number(args['job-batch-size']) : undefined,
      charCap: args['char-cap'] ? Number(args['char-cap']) : undefined,
      onProgress: (current, total) => {
        if (current % 20 === 0 || current === total) process.stderr.write(`Resumes ${current}/${total}\n`);
      },
    });
    const packagePath = path.join(ROOT, 'node_modules/@huggingface/transformers/package.json');
    const modelFiles = Object.fromEntries([
      'config.json', 'tokenizer_config.json', 'tokenizer.json', 'special_tokens_map.json',
      'vocab.txt', 'onnx/model_quantized.onnx',
    ].filter((name) => fs.existsSync(path.join(modelPath, name)))
      .map((name) => [name, digest(fs.readFileSync(path.join(modelPath, name)))]));
    Object.assign(result, { model: path.resolve(args.model), elapsed_seconds: (performance.now() - started) / 1000,
      model_file_sha256: modelFiles,
      input_sha256: digest(inputText), runtime_source: helpers.provenance,
      runtime: { transformersjs: JSON.parse(fs.readFileSync(packagePath, 'utf8')).version,
        node: process.version, backend: 'onnxruntime-node CPU', threads,
        tokenizer_max_length: extractor.tokenizer.model_max_length,
        limitation: 'Uses actual Transformers.js preprocessing/batching; browser WASM kernel parity is not asserted.' } });
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(args.output, JSON.stringify(result, null, 2) + '\n');
    process.stderr.write(`Saved ${result.scores.length} scores to ${args.output}\n`);
    return result;
  } finally { await extractor.dispose(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
