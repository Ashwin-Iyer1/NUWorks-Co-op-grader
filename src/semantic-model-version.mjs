// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

export const SEMANTIC_MODEL_ID = "turtlecap/mdbr-leaf-mt-resume-grader";
export const SEMANTIC_MODEL_REVISION_KEY = "semanticModelRevision";
export const SEMANTIC_MODEL_CALIBRATIONS_KEY = "semanticModelCalibrations";
export const TRANSFORMERS_CACHE_NAME = "transformers-cache";

// Bundled fallback for the expanded 2026-08-27 model. The same payload lives
// beside the weights as calibration.json and is fetched at the pinned model
// revision. Keeping a bundled copy lets a cached model continue to score while
// offline after it has been upgraded.
export const EXPANDED_SEMANTIC_CALIBRATION = Object.freeze({
  schema_version: 1,
  model_release: "expanded-openai-bge-replay-2026-08-27",
  method: "quantile_piecewise_linear",
  cosine_knots: Object.freeze([
    0.3639161587, 0.4276538295, 0.4782150984, 0.5056520581,
    0.5533524156, 0.596550107, 0.6492618918, 0.6960515141,
    0.7169344574, 0.7617661941, 0.8005968928,
  ]),
  score_knots: Object.freeze([
    0.02, 0.03, 0.05, 0.08, 0.12, 0.3, 0.43, 0.62, 0.68, 0.82, 0.88,
  ]),
});

// Runtime fields from the frozen r2 calibration.json (SHA-256
// 3424ce9d3f94df53f5f12d962859408d07543fd2c6d8d38a9fb410cf7a65da6e).
// The full validation provenance stays with that file on the Hub.
export const DEFAULT_SEMANTIC_CALIBRATION = Object.freeze({
  schema_version: 1,
  model_release: "major-agnostic-bge-2026-10-15-r2",
  method: "quantile_piecewise_linear",
  cosine_knots: Object.freeze([
    0.1776963988029566, 0.23981984925483318, 0.8022639657486932,
  ]),
  score_knots: Object.freeze([0, 0, 0.7033154226801739]),
});
export const DEFAULT_SEMANTIC_CALIBRATION_REVISION =
  "d67ad62deee2dfefa2f9d365b42abbbedfb88ef4";

// A fallback is valid only for the exact immutable weights it accompanied.
// Add each promoted release's SHA and calibration together; never infer this
// association from whichever revision happens to be latest on the Hub.
export const BUNDLED_SEMANTIC_CALIBRATIONS = Object.freeze({
  a77f5eb7d1c206088789eab5a270b9943a59304a: EXPANDED_SEMANTIC_CALIBRATION,
  [DEFAULT_SEMANTIC_CALIBRATION_REVISION]: DEFAULT_SEMANTIC_CALIBRATION,
});

// Historical revisions used this affine display map. Retain it for explicit
// legacy comparisons; an unversioned /main cache cannot safely select it.
export const LEGACY_SEMANTIC_CALIBRATION = Object.freeze({
  schema_version: 1,
  model_release: "legacy-bge-affine",
  method: "affine",
  slope: 1.9226748511,
  intercept: -0.9568563562,
});

const buildTestRevision = String(
  globalThis.__NUWG_TEST_MODEL_REVISION__ || ""
);

// Production builds never define this global. The dedicated test build injects
// a local config script that supplies a fake installed revision, allowing the
// update badge to be exercised repeatedly without publishing another model.
export const TEST_MODEL_REVISION_OVERRIDE = buildTestRevision.trim();
export const IS_MODEL_UPDATE_TEST_BUILD =
  TEST_MODEL_REVISION_OVERRIDE.length > 0;

export function installedRevisionForComparison(
  storedRevision,
  testOverride = TEST_MODEL_REVISION_OVERRIDE
) {
  return String(testOverride || storedRevision || "").trim() || null;
}

export function isModelUpdateAvailable({
  storedRevision,
  latestRevision,
  cachedAssetCount,
  testOverride = TEST_MODEL_REVISION_OVERRIDE,
}) {
  const installed = installedRevisionForComparison(
    storedRevision,
    testOverride
  );
  if (!latestRevision) return false;

  // A brand-new opt-in with no model files should simply download the latest
  // revision during normal setup. Existing legacy caches have no stored SHA,
  // so they need the upgrade badge once this feature ships.
  if (!installed) return Number(cachedAssetCount) > 0;
  return installed !== latestRevision;
}

export async function fetchLatestModelRevision(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Model update checks are unavailable in this browser.");
  }
  const response = await fetchImpl(
    `https://huggingface.co/api/models/${SEMANTIC_MODEL_ID}`,
    {
      cache: "no-store",
      headers: { Accept: "application/json" },
    }
  );
  if (!response.ok) {
    throw new Error(`Hugging Face update check failed: HTTP ${response.status}`);
  }
  const metadata = await response.json();
  const revision = String(metadata?.sha || "").trim();
  if (!/^[a-f0-9]{40}$/i.test(revision)) {
    throw new Error("Hugging Face returned an invalid model revision.");
  }
  return revision;
}

export function validateSemanticCalibration(value) {
  if (!value || Number(value.schema_version) !== 1) {
    throw new Error("Model calibration has an unsupported schema version.");
  }
  if (value.method === "affine") {
    const slope = Number(value.slope);
    const intercept = Number(value.intercept);
    if (!Number.isFinite(slope) || slope <= 0 || !Number.isFinite(intercept)) {
      throw new Error("Model affine calibration is invalid.");
    }
    return { ...value, slope, intercept };
  }
  if (value.method !== "quantile_piecewise_linear") {
    throw new Error("Model calibration method is unsupported.");
  }
  const cosineKnots = Array.from(value.cosine_knots || [], Number);
  const scoreKnots = Array.from(value.score_knots || [], Number);
  if (cosineKnots.length < 2 || cosineKnots.length !== scoreKnots.length) {
    throw new Error("Model calibration knots are incomplete.");
  }
  for (let i = 0; i < cosineKnots.length; i++) {
    if (!Number.isFinite(cosineKnots[i]) || !Number.isFinite(scoreKnots[i])) {
      throw new Error("Model calibration knots must be finite numbers.");
    }
    if (scoreKnots[i] < 0 || scoreKnots[i] > 1) {
      throw new Error("Model calibration scores must be within 0 and 1.");
    }
    if (i > 0 && cosineKnots[i] <= cosineKnots[i - 1]) {
      throw new Error("Model cosine calibration knots must increase.");
    }
    if (i > 0 && scoreKnots[i] < scoreKnots[i - 1]) {
      throw new Error("Model score calibration knots must not decrease.");
    }
  }
  return {
    ...value,
    cosine_knots: cosineKnots,
    score_knots: scoreKnots,
  };
}

export async function fetchModelCalibration(
  revision,
  fetchImpl = globalThis.fetch
) {
  if (!/^[a-f0-9]{40}$/i.test(String(revision || ""))) {
    throw new Error("A pinned model revision is required for calibration.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Model calibration is unavailable in this browser.");
  }
  const response = await fetchImpl(
    `https://huggingface.co/${SEMANTIC_MODEL_ID}/resolve/${revision}/calibration.json`,
    { headers: { Accept: "application/json" } }
  );
  if (!response.ok) {
    throw new Error(`Model calibration fetch failed: HTTP ${response.status}`);
  }
  return validateSemanticCalibration(await response.json());
}

export async function resolveModelCalibration(
  revision,
  { cachedRecords = {}, fetchImpl = globalThis.fetch } = {}
) {
  if (!/^[a-f0-9]{40}$/i.test(String(revision || ""))) {
    throw new Error(
      "The installed AI model version is unknown. Connect to the internet and " +
        "choose AI upgrade before scoring. Keyword scores remain available."
    );
  }

  const cached = cachedRecords?.[revision];
  if (cached?.model_id === SEMANTIC_MODEL_ID && cached.revision === revision) {
    try {
      return validateSemanticCalibration(cached.calibration);
    } catch {
      // Corrupt/stale storage must not prevent fetching a valid pinned copy.
    }
  }

  try {
    return await fetchModelCalibration(revision, fetchImpl);
  } catch (error) {
    const bundled = BUNDLED_SEMANTIC_CALIBRATIONS[revision];
    if (bundled) return validateSemanticCalibration(bundled);
    throw new Error(
      `Matching AI calibration for model ${revision.slice(0, 8)} is unavailable. ` +
        "Connect to the internet and try again. Keyword scores remain available.",
      { cause: error }
    );
  }
}

export function calibrationCacheRecord(revision, calibration) {
  if (!/^[a-f0-9]{40}$/i.test(String(revision || ""))) {
    throw new Error("A pinned model revision is required for calibration storage.");
  }
  return {
    model_id: SEMANTIC_MODEL_ID,
    revision,
    calibration: validateSemanticCalibration(calibration),
  };
}

function isModelAssetRequest(request) {
  const rawUrl =
    typeof request === "string" ? request : String(request?.url || "");
  let decoded = rawUrl;
  try {
    decoded = decodeURIComponent(rawUrl);
  } catch {
    // A malformed escape sequence cannot stop cache maintenance.
  }
  return decoded.toLowerCase().includes(SEMANTIC_MODEL_ID.toLowerCase());
}

export async function countCachedModelAssets(
  cacheStorage = globalThis.caches
) {
  if (!cacheStorage?.open) return 0;
  const cache = await cacheStorage.open(TRANSFORMERS_CACHE_NAME);
  const requests = await cache.keys();
  return requests.filter(isModelAssetRequest).length;
}

export async function deleteCachedModelAssets(
  cacheStorage = globalThis.caches
) {
  if (!cacheStorage?.open) {
    throw new Error("Browser model cache is unavailable.");
  }
  const cache = await cacheStorage.open(TRANSFORMERS_CACHE_NAME);
  const requests = (await cache.keys()).filter(isModelAssetRequest);
  let deleted = 0;
  let onnxDeleted = 0;
  for (const request of requests) {
    if (await cache.delete(request)) {
      deleted++;
      const url =
        typeof request === "string" ? request : String(request?.url || "");
      if (/\.onnx(?:$|[?#])/i.test(url)) onnxDeleted++;
    }
  }
  return { deleted, onnxDeleted };
}
