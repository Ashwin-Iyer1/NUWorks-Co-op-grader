import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRuntimeHelpers, resumeVector, scoreInput } from './evaluate_transformersjs.mjs';

test('loads exact extension helpers and caller batch size', () => {
  const helpers = loadRuntimeHelpers();
  assert.equal(helpers.defaults.jobBatchSize, 16);
  assert.equal(helpers.defaults.charCap, 1200);
  assert.equal(helpers.htmlToText('<p>Research&nbsp;&amp; analysis</p><p>Lab</p>'), 'Research & analysis\nLab');
  assert.deepEqual(Array.from(helpers.chunkText('a\nb', 2)), ['a', 'b']);
  assert.equal(helpers.provenance.worker_sha256.length, 64);
});

test('per-resume chunk batches and full ordered job batch cache match worker boundaries', async () => {
  const calls = [];
  const values = { a: [1, 0], b: [0, 1], c: [Math.SQRT1_2, Math.SQRT1_2] };
  const extractor = async (texts, options) => {
    calls.push([...texts]);
    assert.deepEqual(options, { pooling: 'mean', normalize: true });
    return { dims: [texts.length, 2], data: new Float32Array(texts.flatMap((text) => values[text])) };
  };
  const helpers = { defaults: { jobBatchSize: 2, charCap: 1200 }, htmlToText: (text) => text,
    chunkText: (text) => text.split('|') };
  const input = { resumes: [{ id: 'r1', text: 'a|b' }, { id: 'r2', text: 'a' }],
    jobs: ['a', 'b', 'c'].map((text) => ({ id: text, text })),
    pairs: [
      { id: '1', resume_id: 'r1', job_id: 'a' }, { id: '2', resume_id: 'r1', job_id: 'b' },
      { id: '3', resume_id: 'r1', job_id: 'c' }, { id: '4', resume_id: 'r2', job_id: 'a' },
      { id: '5', resume_id: 'r2', job_id: 'b' },
    ] };
  const result = await scoreInput(input, extractor, helpers);
  assert.deepEqual(calls, [['a', 'b'], ['a', 'b'], ['c'], ['a']]);
  assert.equal(result.counts.resume_pipeline_calls, 2);
  assert.equal(result.counts.job_pipeline_calls, 2);
  assert.ok(Math.abs(result.scores[0].prediction - Math.SQRT1_2) < 1e-7);
  assert.equal(result.scores[3].prediction, 1);
});

test('does not reuse one job embedding across different quantization batches', async () => {
  const calls = [];
  const extractor = async (texts) => {
    calls.push([...texts]);
    return { dims: [texts.length, 2], data: new Float32Array(texts.flatMap(() => [1, 0])) };
  };
  const helpers = { defaults: { jobBatchSize: 16, charCap: 1200 }, htmlToText: (text) => text,
    chunkText: (text) => [text] };
  await scoreInput({ resumes: [{ id: 'r', text: 'resume' }], jobs: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }],
    pairs: [{ id: '1', dataset: 'first', resume_id: 'r', job_id: 'a' },
      { id: '2', dataset: 'first', resume_id: 'r', job_id: 'b' },
      { id: '3', dataset: 'second', resume_id: 'r', job_id: 'a' }] }, extractor, helpers);
  assert.deepEqual(calls, [['resume'], ['a', 'b'], ['a']]);
});

test('Float32 accumulation reproduces worker vector normalization', () => {
  const vector = resumeVector({ dims: [2, 2], data: new Float32Array([1, 0, 0, 1]) });
  assert.ok(vector instanceof Float32Array);
  assert.ok(Math.abs(vector[0] - Math.SQRT1_2) < 1e-7);
  assert.equal(vector[0], vector[1]);
});
