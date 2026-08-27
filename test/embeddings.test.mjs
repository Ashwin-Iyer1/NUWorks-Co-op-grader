import assert from "node:assert/strict";
import test from "node:test";

import { cosineToScore } from "../src/embeddings.js";
import {
  DEFAULT_SEMANTIC_CALIBRATION,
  LEGACY_SEMANTIC_CALIBRATION,
} from "../src/semantic-model-version.mjs";

test("expanded-model calibration interpolates monotonically between knots", () => {
  assert.equal(cosineToScore(0.2), 2);
  assert.equal(cosineToScore(0.596550107), 30);
  assert.equal(cosineToScore(0.741), 76);
  assert.equal(cosineToScore(0.7617661941), 82);
  assert.equal(cosineToScore(0.9), 88);

  const scores = DEFAULT_SEMANTIC_CALIBRATION.cosine_knots.map((cosine) =>
    cosineToScore(cosine)
  );
  assert.deepEqual(scores, [2, 3, 5, 8, 12, 30, 43, 62, 68, 82, 88]);
});

test("legacy revisions keep the previous affine display score", () => {
  assert.equal(cosineToScore(0.7891, LEGACY_SEMANTIC_CALIBRATION), 56);
});
