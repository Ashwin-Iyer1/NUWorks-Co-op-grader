// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

export const SEMANTIC_MODEL_ID = "turtlecap/mdbr-leaf-mt-resume-grader";
export const SEMANTIC_MODEL_REVISION_KEY = "semanticModelRevision";
export const TRANSFORMERS_CACHE_NAME = "transformers-cache";

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
