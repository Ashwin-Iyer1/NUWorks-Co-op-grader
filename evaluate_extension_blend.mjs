#!/usr/bin/env node
/** Evaluate a fixed UI blend from saved cosine predictions. No fitting or inference.
 * The authoritative labels CSV replaces any labels carried in prediction files.
 * Reports contain numeric aggregates only, never resume/job text or rationales.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"' && value === '') quoted = true;
    else if (ch === ',') { row.push(value); value = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += ch;
  }
  if (quoted) throw new Error('Unterminated quoted CSV value');
  if (row.length || value) { row.push(value); rows.push(row); }
  const header = rows.shift();
  if (!header?.length || new Set(header).size !== header.length) throw new Error('Invalid CSV header');
  return rows.filter(r => r.some(Boolean)).map(r => {
    if (r.length !== header.length) throw new Error('CSV row has incorrect field count');
    return Object.fromEntries(header.map((key, i) => [key, r[i]]));
  });
}

export function runtimeJobText(text) {
  return text.replace(/^Position: ([^\n]*)\n\nDescription:\n([\s\S]*)$/, '$1\n$2');
}

const pairKey = row => JSON.stringify([row.resume_id || sha(row.resume), row.job_id || sha(row.job)]);

export function alignPredictions(labels, predictions) {
  const map = new Map();
  for (const row of predictions) {
    if (typeof row.resume !== 'string' || !row.resume.trim() || typeof row.job !== 'string' || !row.job.trim()) {
      throw new Error('Prediction row requires nonempty resume/job text');
    }
    const key = pairKey(row);
    if (map.has(key)) throw new Error('Duplicate prediction pair');
    if (!Number.isFinite(Number(row.prediction)) || row.prediction === '') throw new Error('Invalid prediction');
    map.set(key, row);
  }
  if (map.size !== labels.length) throw new Error('Prediction/label pair count mismatch');
  const seen = new Set();
  return labels.map(row => {
    const key = pairKey(row);
    if (seen.has(key)) throw new Error('Duplicate label pair');
    seen.add(key);
    const pred = map.get(key);
    if (!pred || pred.resume !== row.resume || pred.job !== row.job) throw new Error('Prediction/label pair or text mismatch');
    return Number(pred.prediction);
  });
}

export function ranks(values) {
  const order = values.map((value, i) => ({ value, i })).sort((a, b) => a.value - b.value);
  const result = Array(values.length);
  for (let start = 0; start < order.length;) {
    let end = start + 1;
    while (end < order.length && order[end].value === order[start].value) end++;
    for (let i = start; i < end; i++) result[order[i].i] = (start + end - 1) / 2;
    start = end;
  }
  return result;
}

export function spearman(labels, predictions) {
  if (labels.length < 2 || new Set(labels).size < 2) return null;
  if (new Set(predictions).size < 2) return 0;
  const x = ranks(labels), y = ranks(predictions), xm = mean(x), ym = mean(y);
  let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i < x.length; i++) {
    xy += (x[i] - xm) * (y[i] - ym); xx += (x[i] - xm) ** 2; yy += (y[i] - ym) ** 2;
  }
  return xy / Math.sqrt(xx * yy);
}

export function tieAwareNdcg(labels, predictions, k = 10) {
  const gains = labels.map(label => 2 ** label - 1);
  const discounts = labels.map((_, i) => i < k ? 1 / Math.log2(i + 2) : 0);
  const order = predictions.map((score, i) => ({ score, gain: gains[i] })).sort((a, b) => b.score - a.score);
  let dcg = 0;
  for (let start = 0; start < order.length;) {
    let end = start + 1;
    while (end < order.length && order[end].score === order[start].score) end++;
    dcg += mean(order.slice(start, end).map(x => x.gain)) * discounts.slice(start, end).reduce((a, b) => a + b, 0);
    start = end;
  }
  const ideal = gains.sort((a, b) => b - a).reduce((sum, gain, i) => sum + gain * discounts[i], 0);
  return ideal > 0 ? dcg / ideal : null;
}

export function metrics(labels, scores) {
  return {
    spearman: spearman(labels, scores),
    ndcg_at_10: tieAwareNdcg(labels, scores),
    mae_points: mean(labels.map((label, i) => Math.abs(label * 100 - scores[i]))),
  };
}

export function pairedCI(deltas, draws = 10000, seed = 20261015) {
  deltas = deltas.filter(Number.isFinite);
  if (!deltas.length) return { mean: null, ci95: null, clusters: 0 };
  let state = seed >>> 0;
  const random = () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const samples = Array.from({ length: draws }, () => {
    let total = 0;
    for (let i = 0; i < deltas.length; i++) total += deltas[Math.floor(random() * deltas.length)];
    return total / deltas.length;
  }).sort((a, b) => a - b);
  const percentile = q => {
    const i = q * (samples.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
    return samples[lo] + (samples[hi] - samples[lo]) * (i - lo);
  };
  return { mean: mean(deltas), ci95: [percentile(0.025), percentile(0.975)], clusters: deltas.length };
}

export async function loadScoring(ref = 'chrome-extension') {
  const read = name => execFileSync('git', ['show', `${ref}:src/${name}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8e6 });
  const matcher = read('matcher.js'), embeddings = read('embeddings.js'), caller = read('custom.js');
  const version = read('semantic-model-version.mjs');
  const moduleFrom = text => import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
  const { default: JobMatcher } = await moduleFrom(matcher);
  const { validateSemanticCalibration } = await moduleFrom(version);
  const scoreFn = embeddings.match(/^export function cosineToScore\([^]*?^\}/m)?.[0].replace(/^export /, '');
  const blendFn = caller.match(/^function applySemanticWeight\([^]*?^\}/m)?.[0];
  if (!scoreFn || !blendFn || !caller.includes('const DEFAULT_SEMANTIC_WEIGHT_PERCENT = 35;')) {
    throw new Error('Runtime contract changed; fixed 65/35 evaluation requires review');
  }
  const helpers = vm.runInNewContext(`${scoreFn}\n${blendFn}\n({cosineToScore,applySemanticWeight})`, {}, { timeout: 1000 });
  return { matcher: new JobMatcher(), validateSemanticCalibration, ...helpers, provenance: {
    ref, commit: execFileSync('git', ['rev-parse', ref], { cwd: ROOT, encoding: 'utf8' }).trim(),
    matcher_sha256: sha(matcher), embeddings_sha256: sha(embeddings), caller_sha256: sha(caller),
    calibration_validator_sha256: sha(version),
  } };
}

export async function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error('Expected --key value arguments');
    args[argv[i].slice(2)] = argv[i + 1];
  }
  for (const key of ['labels', 'baseline', 'candidate', 'baseline-calibration', 'candidate-calibration', 'output']) {
    if (!args[key]) throw new Error(`Missing --${key}`);
  }
  const inputs = Object.fromEntries(['labels', 'baseline', 'candidate', 'baseline-calibration', 'candidate-calibration']
    .map(key => [key, fs.readFileSync(args[key], 'utf8')]));
  const rows = parseCSV(inputs.labels);
  if (!rows.length || rows.some(r => r.score === '' || !Number.isFinite(Number(r.score)) || Number(r.score) < 0 || Number(r.score) > 1)) {
    throw new Error('Labels must be nonempty and normalized to [0,1]');
  }
  const cosines = Object.fromEntries(['baseline', 'candidate'].map(key => [key, alignPredictions(rows, parseCSV(inputs[key]))]));
  const scoring = await loadScoring(args['runtime-ref'] || 'chrome-extension');
  const curves = Object.fromEntries(['baseline', 'candidate'].map(key =>
    [key, scoring.validateSemanticCalibration(JSON.parse(inputs[`${key}-calibration`]))]));
  const groups = new Map(), resumeTexts = new Map(), jobTexts = new Map();
  const all = { lexical: [], baseline: [], candidate: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], id = row.resume_id || sha(row.resume);
    for (const [map, key, text] of [[resumeTexts, id, row.resume], [jobTexts, row.job_id || sha(row.job), row.job]]) {
      if (map.has(key) && map.get(key) !== text) throw new Error('A document ID refers to multiple texts');
      map.set(key, text);
    }
    const lexical = scoring.matcher.calculateScore(row.resume, runtimeJobText(row.job)).score;
    const result = { label: Number(row.score), lexical };
    for (const key of ['baseline', 'candidate']) {
      const semanticScore = scoring.cosineToScore(cosines[key][i], curves[key]);
      const job = { baseMatchScore: lexical, matchScore: lexical, matchDetails: { details: { semanticScore } } };
      if (!scoring.applySemanticWeight(job, 0.35) || !Number.isFinite(job.matchScore)) throw new Error('Invalid blended score');
      result[key] = job.matchScore;
    }
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(result);
    for (const key of Object.keys(all)) all[key].push(result[key]);
  }
  const perResume = [...groups.values()].map((group, i) => ({
    resume_index: i + 1, pairs: group.length,
    ...Object.fromEntries(Object.keys(all).map(key => [key, metrics(group.map(r => r.label), group.map(r => r[key]))])),
  }));
  const report = {
    schema_version: 1,
    evaluation: 'fixed_default_extension_blend_node_simulation',
    model_release: curves.candidate.model_release,
    pairs: rows.length, resumes: groups.size, unique_jobs: new Set(rows.map(r => r.job_id || sha(r.job))).size,
    semantic_weight: 0.35, keyword_weight: 0.65, fitting_performed: false,
    metrics: Object.fromEntries(Object.keys(all).map(key => [key, {
      global_spearman: spearman(rows.map(r => Number(r.score)), all[key]),
      mae_points: mean(rows.map((r, i) => Math.abs(Number(r.score) * 100 - all[key][i]))),
      rankable_resumes: perResume.filter(r => r[key].spearman !== null).length,
      mean_resume_spearman: mean(perResume.map(r => r[key].spearman).filter(x => x !== null)),
      mean_ndcg_at_10: mean(perResume.map(r => r[key].ndcg_at_10).filter(x => x !== null)),
      mean_resume_mae_points: mean(perResume.map(r => r[key].mae_points)),
    }])),
    paired_candidate_minus_baseline: Object.fromEntries(['spearman', 'ndcg_at_10', 'mae_points'].map(key =>
      [key, pairedCI(perResume.filter(r => r.baseline[key] !== null && r.candidate[key] !== null)
        .map(r => r.candidate[key] - r.baseline[key]))])),
    bootstrap: { method: 'paired_resample_whole_resumes', draws: 10000, seed: 20261015, scope: 'conditional_on_reused_job_pool' },
    per_resume: perResume,
    runtime_source: scoring.provenance,
    input_sha256: Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, sha(value)])),
    script_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
    command: ['node', 'evaluate_extension_blend.mjs', ...argv],
    method: [
      'The labels CSV is authoritative; score columns in saved prediction files are ignored. Pairs join by IDs with exact resume/job text verification.',
      'Exact extension JobMatcher.calculateScore receives full resume text and full title + newline + job description, with labeling wrappers removed. The lexical input is not clipped.',
      'Semantic cosines come from saved Transformers.js Node predictions: mean-pooled resume chunks and htmlToText(title + newline + description) clipped to 1200 characters then tokenized to 256 tokens.',
      'Exact cosineToScore rounds each calibrated semantic score to an integer 0-100. Exact applySemanticWeight then rounds 65% lexical + 35% semantic.',
      'Spearman uses average tie ranks; constant predictions receive zero correlation. NDCG@10 uses 2^normalized_label-1 gain and expected DCG across ties, including cutoff ties.',
    ],
    limitations: [
      'Simulated Node scoring, not browser WASM execution or a live extension UI test.',
      'No NUWorks eligibility flags, school-year/graduate-date filters, profile-skill enrichment, or job filtering were available; all supplied pairs were scored.',
      'Resume documents and shared job pool are the evaluation sample. Pair counts are not independent applicant counts.',
      'Teacher labels measure judged resume-job fit, not hiring outcomes or population fairness. No weights, curves or model parameters were fitted here.',
    ],
  };
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output: args.output, pairs: report.pairs, resumes: report.resumes,
    metrics: report.metrics, paired_candidate_minus_baseline: report.paired_candidate_minus_baseline }, null, 2));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
