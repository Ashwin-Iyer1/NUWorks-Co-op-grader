import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import {
  SEMANTIC_MODEL_CALIBRATIONS_KEY,
  SEMANTIC_MODEL_REVISION_KEY,
  calibrationCacheRecord,
  resolveModelCalibration,
} from "../src/semantic-model-version.mjs";

const source = await readFile(new URL("../src/custom.js", import.meta.url), "utf8");
const REVISION = "b".repeat(40);
const CALIBRATION = {
  schema_version: 1,
  method: "quantile_piecewise_linear",
  cosine_knots: [0.2, 0.8],
  score_knots: [0.1, 0.9],
};

// Run the actual page orchestration without its unrelated DOM startup.
function pageFunction(name, globals) {
  const body = source.match(new RegExp(`^async function ${name}\\([^]*?^\\}`, "m"));
  assert.ok(body, `Page function ${name} exists`);
  const context = vm.createContext({ console: { warn() {} }, ...globals });
  vm.runInContext(body[0], context);
  return { context, run: (...args) => context[name](...args) };
}

test("cold offline startup retains the stored model pin", async () => {
  for (const failingPart of ["network", "cache"]) {
    const page = pageFunction("checkSemanticModelUpdate", {
      SEMANTIC_MODEL_REVISION_KEY,
      modelRevisionToLoad: null,
      semanticStorageGet: async () => ({ semanticEnabled: true, [SEMANTIC_MODEL_REVISION_KEY]: REVISION }),
      hideSemanticUpgradeBadge() {}, showSemanticRangeSlider() {},
      fetchLatestModelRevision: async () => {
        if (failingPart === "network") throw new Error("offline");
        return "c".repeat(40);
      },
      countCachedModelAssets: async () => {
        if (failingPart === "cache") throw new Error("cache unavailable");
        return 4;
      },
    });
    assert.equal(await page.run(), false);
    assert.equal(page.context.modelRevisionToLoad, REVISION);
  }
});

test("the page persists pinned calibration and reloads it with the network offline", async () => {
  let storage = {};
  let calls = 0;
  let offline = false;
  const globals = {
    SEMANTIC_MODEL_CALIBRATIONS_KEY,
    semanticCalibrationByRevision: new Map(),
    semanticStorageGet: async () => structuredClone(storage),
    semanticStorageSet: async (values) => { storage = structuredClone(values); },
    calibrationCacheRecord,
    resolveModelCalibration: (revision, options) => resolveModelCalibration(revision, {
      ...options,
      fetchImpl: async () => {
        calls++;
        if (offline) throw new Error("offline");
        return { ok: true, json: async () => CALIBRATION };
      },
    }),
  };
  const firstPage = pageFunction("getSemanticCalibration", globals);
  assert.deepEqual(await firstPage.run(REVISION), CALIBRATION);
  assert.equal(storage[SEMANTIC_MODEL_CALIBRATIONS_KEY][REVISION].revision, REVISION);
  assert.equal(calls, 1);
  offline = true;
  const reopenedPage = pageFunction("getSemanticCalibration", {
    ...globals, semanticCalibrationByRevision: new Map(),
  });
  assert.deepEqual(await reopenedPage.run(REVISION), CALIBRATION);
  assert.equal(calls, 1, "offline reopen does not depend on a fetch or HTTP cache");
});

test("calibration failure clears the spinner and explains the available keyword scores", async () => {
  const notices = [];
  const tasks = [];
  const message = "Matching AI calibration is unavailable. Keyword scores remain available.";
  const page = pageFunction("semanticRefine", {
    semanticRunId: 0,
    semanticCache: { key: null, scorer: null },
    semanticScorerKey: text => text,
    getSemanticScorer: async () => { throw new Error(message); },
    setBgTask: (name, state) => tasks.push({ name, state }),
    failDownloadProgress: text => notices.push(text),
    showToast: text => notices.push(text),
  });
  await page.run({ semanticEnabled: true, resume: "A test resume" });
  assert.deepEqual(tasks.at(-1), { name: "semantic", state: null });
  assert.deepEqual(notices, [message, message]);
});

test("an upgrade with unavailable calibration keeps the installed cache and revision", async () => {
  let removed = false;
  let disposed = false;
  const label = { textContent: "AI upgrade" };
  const badge = { disabled: false, hidden: false, querySelector: () => label };
  const page = pageFunction("upgradeSemanticModel", {
    modelUpgradeBusy: false,
    modelRevisionToLoad: "a".repeat(40),
    latestSemanticModelRevision: REVISION,
    semanticCache: { scorer: { dispose() { disposed = true; } } },
    semanticRunId: 0,
    IS_MODEL_UPDATE_TEST_BUILD: false,
    $: id => id === "semantic-upgrade-badge" ? badge : {},
    showDownloadProgress() {}, failDownloadProgress() {}, showToast() {},
    getSemanticCalibration: async () => { throw new Error("Matching calibration unavailable"); },
    deleteCachedModelAssets: async () => { removed = true; },
    semanticStorageRemove: async () => { throw new Error("Must preserve installed pin"); },
    console: { error() {} },
  });
  await page.run();
  assert.equal(removed, false);
  assert.equal(disposed, false);
  assert.equal(page.context.modelRevisionToLoad, "a".repeat(40));
  assert.equal(badge.disabled, false);
  assert.equal(badge.hidden, false);
});
