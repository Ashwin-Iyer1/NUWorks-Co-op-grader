import assert from "node:assert/strict";
import test from "node:test";

import {
  BUNDLED_SEMANTIC_CALIBRATIONS,
  DEFAULT_SEMANTIC_CALIBRATION,
  DEFAULT_SEMANTIC_CALIBRATION_REVISION,
  calibrationCacheRecord,
  countCachedModelAssets,
  deleteCachedModelAssets,
  fetchLatestModelRevision,
  fetchModelCalibration,
  installedRevisionForComparison,
  isModelUpdateAvailable,
  resolveModelCalibration,
  validateSemanticCalibration,
} from "../src/semantic-model-version.mjs";

const REVISION_A = "a".repeat(40);
const REVISION_B = "b".repeat(40);
const TEST_CALIBRATION = {
  schema_version: 1,
  model_release: "test-release",
  method: "quantile_piecewise_linear",
  cosine_knots: [0.2, 0.8],
  score_knots: [0.1, 0.9],
};

test("an offline model uses only its validated persistent calibration", async () => {
  const cachedRecords = {
    [REVISION_A]: calibrationCacheRecord(REVISION_A, TEST_CALIBRATION),
  };
  const offline = async () => { throw new Error("offline"); };
  assert.deepEqual(
    await resolveModelCalibration(REVISION_A, { cachedRecords, fetchImpl: offline }),
    TEST_CALIBRATION
  );
  await assert.rejects(
    resolveModelCalibration(REVISION_B, { cachedRecords, fetchImpl: offline }),
    /Matching AI calibration.*unavailable/
  );
});

test("a mismatched or invalid cache entry is replaced by pinned remote data", async () => {
  for (const record of [
    { ...calibrationCacheRecord(REVISION_A, TEST_CALIBRATION), revision: REVISION_B },
    { ...calibrationCacheRecord(REVISION_A, TEST_CALIBRATION), model_id: "another/model" },
    calibrationCacheRecord(REVISION_A, TEST_CALIBRATION),
  ]) {
    if (record.revision === REVISION_A && record.model_id !== "another/model") {
      record.calibration = { ...TEST_CALIBRATION, score_knots: [0.9, 0.1] };
    }
    let calls = 0;
    const result = await resolveModelCalibration(REVISION_A, {
      cachedRecords: { [REVISION_A]: record },
      fetchImpl: async (url) => {
        calls++;
        assert.ok(url.includes(`/resolve/${REVISION_A}/`));
        return { ok: true, json: async () => TEST_CALIBRATION };
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, TEST_CALIBRATION);
  }
});

test("bundled fallback is bound to a known SHA, never the current Hub head", async () => {
  const offline = async () => { throw new Error("offline"); };
  const revision = "a77f5eb7d1c206088789eab5a270b9943a59304a";
  assert.deepEqual(
    await resolveModelCalibration(revision, { fetchImpl: offline }),
    BUNDLED_SEMANTIC_CALIBRATIONS[revision]
  );
  await assert.rejects(resolveModelCalibration(REVISION_B, { fetchImpl: offline }), /unavailable/);
  await assert.rejects(resolveModelCalibration(null, { fetchImpl: offline }), /choose AI upgrade/);
});

test("invalid remote calibration fails closed for an unknown model", async () => {
  await assert.rejects(
    resolveModelCalibration(REVISION_B, {
      fetchImpl: async () => ({ ok: true, json: async () => ({ schema_version: 99 }) }),
    }),
    /Matching AI calibration.*unavailable/
  );
});

test("published r2 SHA can load its exact bundled curve offline", async () => {
  assert.equal(DEFAULT_SEMANTIC_CALIBRATION_REVISION, "d67ad62deee2dfefa2f9d365b42abbbedfb88ef4");
  const calibration = await resolveModelCalibration(DEFAULT_SEMANTIC_CALIBRATION_REVISION, {
    fetchImpl: async () => { throw new Error("offline"); },
  });
  assert.deepEqual(calibration, DEFAULT_SEMANTIC_CALIBRATION);
  assert.equal(calibration.model_release, "major-agnostic-bge-2026-10-15-r2");
});

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
