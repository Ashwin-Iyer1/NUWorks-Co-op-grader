import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, runtimeJobText, alignPredictions, spearman, tieAwareNdcg, pairedCI } from './evaluate_extension_blend.mjs';

test('CSV parser preserves quoted multiline fields and escaped quotes', () => {
  assert.deepEqual(parseCSV('\uFEFFresume,job,score\r\n"a\n""b""","x,y",0.5\r\n'),
    [{ resume: 'a\n"b"', job: 'x,y', score: '0.5' }]);
  assert.throws(() => parseCSV('a,b\n"unterminated'), /Unterminated/);
});

test('authoritative relabels join by ID, preserve exact text, reject missing and duplicate pairs', () => {
  const rows = [{ resume_id: 'r', job_id: 'j1', resume: 'R', job: 'J1', score: '0.9' },
    { resume_id: 'r', job_id: 'j2', resume: 'R', job: 'J2', score: '0.1' }];
  const predictions = rows.map((r, i) => ({ ...r, score: '0.5', prediction: String(i) })).reverse();
  assert.deepEqual(alignPredictions(rows, predictions), [0, 1]);
  assert.throws(() => alignPredictions(rows, [predictions[0], predictions[0]]), /Duplicate/);
  assert.throws(() => alignPredictions(rows, [{ ...predictions[0], job: 'different' }, predictions[1]]), /text mismatch/);
  assert.throws(() => alignPredictions(rows, [predictions[0]]), /count mismatch/);
});

test('runtime labeling envelope is removed without clipping lexical job content', () => {
  const description = '<p>' + 'x'.repeat(1500) + '</p>';
  assert.equal(runtimeJobText(`Position: Role\n\nDescription:\n${description}`), `Role\n${description}`);
  assert.equal(runtimeJobText(description), description);
});

test('ranking metrics handle ties and constant predictions without optimistic omissions', () => {
  assert.equal(spearman([0, 0.5, 1], [30, 20, 10]), -1);
  assert.equal(spearman([0, 0.5, 1], [10, 10, 10]), 0);
  assert.equal(spearman([1, 1], [10, 20]), null);
  assert.equal(tieAwareNdcg([0, 1], [1, 2], 1), 1);
  assert.equal(tieAwareNdcg([0, 1], [2, 2], 1), 0.5);
  assert.deepEqual(pairedCI([0.25, 0.25, 0.25], 100), { mean: 0.25, ci95: [0.25, 0.25], clusters: 3 });
});
