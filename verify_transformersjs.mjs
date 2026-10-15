// Verify the actual extension library's q8 mean-pooling path against vectors
// produced by SentenceTransformer's ONNX backend (input JSON is generated locally).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env, pipeline } from '@huggingface/transformers';

const [modelArg, fixtureArg, resultArg] = process.argv.slice(2);
if (!modelArg || !fixtureArg || !resultArg) {
  throw new Error('Usage: node verify_transformersjs.mjs MODEL FIXTURE_JSON RESULT_JSON');
}
env.allowRemoteModels = false;
env.allowLocalModels = true;
const model = path.resolve(modelArg).replaceAll('\\', '/') + '/';
const fixture = JSON.parse(fs.readFileSync(fixtureArg, 'utf8'));
const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(model, 'onnx/model_quantized.onnx'))).digest('hex');
if (digest !== fixture.model_sha256) throw new Error('Fixture belongs to a different model artifact');
const extractor = await pipeline('feature-extraction', model, { dtype: 'q8', device: 'cpu' });
if (!Array.isArray(fixture.token_lengths) || fixture.token_lengths.some(n => n >= 256)) {
  throw new Error('This numerical check requires short, untruncated inputs and token_lengths. Use evaluate_transformersjs for real runtime ranking.');
}
// Dynamic quantization depends on the other inputs in the batch. Match the
// reference's one-text calls exactly; broad ranking is evaluated separately.
const vectors = [];
for (const text of fixture.texts) {
  vectors.push((await extractor([text], { pooling: 'mean', normalize: true })).tolist()[0]);
}
if (vectors.length !== fixture.vectors.length) throw new Error('Vector count mismatch');
let maxAbs = 0;
let minCosine = 1;
for (let i = 0; i < vectors.length; i++) {
  if (vectors[i].length !== fixture.vectors[i].length) throw new Error('Vector dimension mismatch');
  let dot = 0, a2 = 0, b2 = 0;
  for (let j = 0; j < vectors[i].length; j++) {
    const a = vectors[i][j], b = fixture.vectors[i][j];
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Nonfinite vector');
    maxAbs = Math.max(maxAbs, Math.abs(a - b));
    dot += a * b; a2 += a * a; b2 += b * b;
  }
  minCosine = Math.min(minCosine, dot / Math.sqrt(a2 * b2));
}
const result = { model: modelArg, runtime: '@huggingface/transformers', dtype: 'q8',
  scope: 'single short input numerical parity; not batch or truncation equivalence',
  pooling: 'mean', texts: vectors.length, dimensions: vectors[0].length,
  max_absolute_difference: maxAbs, minimum_vector_cosine: minCosine,
  model_sha256: digest,
  passed: minCosine > 0.99999 && maxAbs < 0.001 };
fs.mkdirSync(path.dirname(resultArg), { recursive: true });
fs.writeFileSync(resultArg, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
await extractor.dispose();
if (!result.passed) process.exitCode = 1;
