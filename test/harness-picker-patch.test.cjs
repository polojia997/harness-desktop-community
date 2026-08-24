const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  PATCH_MARKER,
  patchIndexSource,
  patchWorkerSource
} = require("../scripts/patch-harness-runtime.cjs");

const PACKAGE_ROOT = path.join(
  __dirname,
  "..",
  "node_modules",
  "@deepseek-ai",
  "dsh-host-directory-picker-native",
  "lib"
);

test("Windows picker worker patch is present and idempotent", () => {
  const worker = fs.readFileSync(path.join(PACKAGE_ROOT, "worker.cjs"), "utf8");
  const index = fs.readFileSync(path.join(PACKAGE_ROOT, "index.js"), "utf8");

  assert.match(worker, new RegExp(PATCH_MARKER));
  assert.match(worker, /WideCharToMultiByte/);
  assert.doesNotMatch(worker, /Buffer\.from\(koffi\.view/);
  assert.doesNotMatch(worker, /lstrlenW/);
  assert.doesNotMatch(worker, /bindings\.coUninitialize\(\)/);
  assert.doesNotThrow(() => new Function(worker));
  assert.equal(patchWorkerSource(worker), worker);

  assert.equal((index.match(/windowsHide: false/g) || []).length, 2);
  assert.equal(patchIndexSource(index), index);
});
