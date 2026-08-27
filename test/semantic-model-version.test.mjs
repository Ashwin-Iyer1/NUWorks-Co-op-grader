import assert from "node:assert/strict";
import test from "node:test";

import {
  countCachedModelAssets,
  deleteCachedModelAssets,
  fetchLatestModelRevision,
  fetchModelCalibration,
  installedRevisionForComparison,
  isModelUpdateAvailable,
  validateSemanticCalibration,
} from "../src/semantic-model-version.mjs";

const REVISION_A = "a".repeat(40);
const REVISION_B = "b".repeat(40);

test("a test override takes precedence over the stored revision", () => {
  assert.equal(
    installedRevisionForComparison(REVISION_A, "spoofed-stale-revision"),
    "spoofed-stale-revision"
  );
  assert.equal(installedRevisionForComparison(REVISION_A, ""), REVISION_A);
});

test("legacy caches and changed revisions offer an update", () => {
  assert.equal(
    isModelUpdateAvailable({
      storedRevision: null,
      latestRevision: REVISION_B,
      cachedAssetCount: 4,
      testOverride: "",
    }),
    true
  );
  assert.equal(
    isModelUpdateAvailable({
      storedRevision: null,
      latestRevision: REVISION_B,
      cachedAssetCount: 0,
      testOverride: "",
    }),
    false
  );
  assert.equal(
    isModelUpdateAvailable({
      storedRevision: REVISION_A,
      latestRevision: REVISION_B,
      cachedAssetCount: 4,
      testOverride: "",
    }),
    true
  );
  assert.equal(
    isModelUpdateAvailable({
      storedRevision: REVISION_B,
      latestRevision: REVISION_B,
      cachedAssetCount: 4,
      testOverride: "",
    }),
    false
  );
});

test("the testing override always spoofs a stale installed model", () => {
  assert.equal(
    isModelUpdateAvailable({
      storedRevision: REVISION_B,
      latestRevision: REVISION_B,
      cachedAssetCount: 4,
      testOverride: "local-test-stale-revision",
    }),
    true
  );
});

test("the test-build global activates the spoof at module load", async () => {
  globalThis.__NUWG_TEST_MODEL_REVISION__ = "local-test-stale-revision";
  try {
    const testBuildModule = await import(
      `../src/semantic-model-version.mjs?test-build=${Date.now()}`
    );
    assert.equal(testBuildModule.IS_MODEL_UPDATE_TEST_BUILD, true);
    assert.equal(
      testBuildModule.TEST_MODEL_REVISION_OVERRIDE,
      "local-test-stale-revision"
    );
  } finally {
    delete globalThis.__NUWG_TEST_MODEL_REVISION__;
  }
});

test("the Hub revision parser validates the response", async () => {
  const revision = await fetchLatestModelRevision(async () => ({
    ok: true,
    json: async () => ({ sha: REVISION_A }),
  }));
  assert.equal(revision, REVISION_A);

  await assert.rejects(
    fetchLatestModelRevision(async () => ({
      ok: true,
      json: async () => ({ sha: "main" }),
    })),
    /invalid model revision/
  );
});

test("model calibration is fetched at the pinned revision and validated", async () => {
  let requestedUrl = "";
  const calibration = await fetchModelCalibration(REVISION_A, async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({
        schema_version: 1,
        method: "quantile_piecewise_linear",
        cosine_knots: [0.4, 0.6, 0.8],
        score_knots: [0.1, 0.4, 0.9],
      }),
    };
  });
  assert.match(requestedUrl, new RegExp(`/resolve/${REVISION_A}/calibration\\.json$`));
  assert.deepEqual(calibration.cosine_knots, [0.4, 0.6, 0.8]);

  assert.throws(
    () =>
      validateSemanticCalibration({
        schema_version: 1,
        method: "quantile_piecewise_linear",
        cosine_knots: [0.6, 0.5],
        score_knots: [0.2, 0.7],
      }),
    /must increase/
  );
  await assert.rejects(fetchModelCalibration("main", async () => ({})), /pinned/);
});

test("cache helpers target only this model and remove its ONNX file", async () => {
  const requests = [
    {
      url: "https://huggingface.co/turtlecap/mdbr-leaf-mt-resume-grader/resolve/main/config.json",
    },
    {
      url: "https://huggingface.co/turtlecap/mdbr-leaf-mt-resume-grader/resolve/main/onnx/model_quantized.onnx",
    },
    {
      url: "https://huggingface.co/someone/another-model/resolve/main/model.onnx",
    },
  ];
  const deleted = [];
  const cacheStorage = {
    async open(name) {
      assert.equal(name, "transformers-cache");
      return {
        async keys() {
          return requests;
        },
        async delete(request) {
          deleted.push(request.url);
          return true;
        },
      };
    },
  };

  assert.equal(await countCachedModelAssets(cacheStorage), 2);
  assert.deepEqual(await deleteCachedModelAssets(cacheStorage), {
    deleted: 2,
    onnxDeleted: 1,
  });
  assert.equal(deleted.length, 2);
  assert.ok(deleted.every((url) => url.includes("mdbr-leaf-mt-resume-grader")));
});
