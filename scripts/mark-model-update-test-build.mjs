import { readFile, writeFile } from "node:fs/promises";

const manifestPath = new URL("../dist/manifest.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.name = `${manifest.name} (Model Update Test)`;
manifest.version_name = `${manifest.version} model-update-test`;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const customHtmlPath = new URL("../dist/custom.html", import.meta.url);
const customHtml = await readFile(customHtmlPath, "utf8");
const testConfigTag =
  '<script src="./model-update-test-config.js"></script>';
const firstModuleScript = "<script type=module";
if (!customHtml.includes(firstModuleScript)) {
  throw new Error("Could not inject the model-update test config into custom.html");
}
await writeFile(
  customHtmlPath,
  customHtml.replace(
    firstModuleScript,
    `${testConfigTag}${firstModuleScript}`
  )
);

const configPath = new URL(
  "../dist/model-update-test-config.js",
  import.meta.url
);
await writeFile(
  configPath,
  [
    "// Generated only by npm run build:test-model-update.",
    'globalThis.__NUWG_TEST_MODEL_REVISION__ = "local-test-stale-revision";',
    "",
  ].join("\n")
);

const markerPath = new URL(
  "../dist/MODEL_UPDATE_TEST_BUILD.txt",
  import.meta.url
);
await writeFile(
  markerPath,
  [
    "This /dist folder was built with a spoofed stale model revision.",
    "Open custom.html while opted into Semantic AI to test the upgrade badge.",
    "Run npm run build to replace it with a production-safe build.",
    "",
  ].join("\n")
);
