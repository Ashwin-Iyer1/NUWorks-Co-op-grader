import assert from "node:assert/strict";
import test from "node:test";

import { cosineToScore } from "../src/embeddings.js";
import {
  DEFAULT_SEMANTIC_CALIBRATION,
  EXPANDED_SEMANTIC_CALIBRATION,
  LEGACY_SEMANTIC_CALIBRATION,
} from "../src/semantic-model-version.mjs";

test("expanded-model calibration interpolates monotonically between knots", () => {
  const score = value => cosineToScore(value, EXPANDED_SEMANTIC_CALIBRATION);
  assert.equal(score(0.2), 2);
  assert.equal(score(0.596550107), 30);
  assert.equal(score(0.741), 76);
  assert.equal(score(0.7617661941), 82);
  assert.equal(score(0.9), 88);

  const scores = EXPANDED_SEMANTIC_CALIBRATION.cosine_knots.map(score);
  assert.deepEqual(scores, [2, 3, 5, 8, 12, 30, 43, 62, 68, 82, 88]);
});

test("r2 calibration clips, interpolates and rounds the shipped display score", () => {
  assert.equal(DEFAULT_SEMANTIC_CALIBRATION.model_release, "major-agnostic-bge-2026-10-15-r2");
  assert.equal(cosineToScore(-0.5), 0);
  assert.equal(cosineToScore(0.2), 0);
  assert.equal(cosineToScore(0.4), 20);
  assert.equal(cosineToScore(0.6), 45);
  assert.equal(cosineToScore(0.8), 70);
  assert.equal(cosineToScore(1), 70);
});

test("legacy revisions keep the previous affine display score", () => {
  assert.equal(cosineToScore(0.7891, LEGACY_SEMANTIC_CALIBRATION), 56);
});
