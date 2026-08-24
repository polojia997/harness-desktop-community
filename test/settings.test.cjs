const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { DesktopSettings } = require("../src/main/settings.cjs");

const TEST_PREFIX = "settings-test-";
const PROJECT_ROOT = path.resolve(__dirname, "..");
const TEST_DATA_ROOT = path.join(PROJECT_ROOT, ".test-user-data");

function createSafeTestDirectory() {
  fs.mkdirSync(TEST_DATA_ROOT, { recursive: true });
  return fs.mkdtempSync(path.join(TEST_DATA_ROOT, TEST_PREFIX));
}

function removeSafeTestDirectory(directory) {
  const resolvedDirectory = path.resolve(directory);

  assert.equal(path.dirname(resolvedDirectory), TEST_DATA_ROOT);
  assert.equal(path.basename(resolvedDirectory).startsWith(TEST_PREFIX), true);
  fs.rmSync(resolvedDirectory, { recursive: true, force: true });
}

test("workspace is unset until a project directory is explicitly chosen", () => {
  const testRoot = createSafeTestDirectory();
  const userDataPath = path.join(testRoot, "user-data");
  const workspacePath = path.join(testRoot, "project");
  fs.mkdirSync(workspacePath);

  try {
    const settings = new DesktopSettings(userDataPath);
    assert.equal(settings.getWorkspacePath(), null);

    settings.setWorkspacePath(workspacePath);
    assert.equal(settings.getWorkspacePath(), workspacePath);

    const reloadedSettings = new DesktopSettings(userDataPath);
    assert.equal(reloadedSettings.getWorkspacePath(), workspacePath);
  } finally {
    removeSafeTestDirectory(testRoot);
  }
});

test("protected workspace paths are ignored and cannot be saved", () => {
  const testRoot = createSafeTestDirectory();
  const userDataPath = path.join(testRoot, "user-data");

  try {
    const settings = new DesktopSettings(userDataPath, {
      protectedWorkspacePaths: [testRoot]
    });

    assert.equal(settings.getWorkspacePath(), null);
    assert.throws(
      () => settings.setWorkspacePath(testRoot),
      /请选择具体的项目目录/
    );
  } finally {
    removeSafeTestDirectory(testRoot);
  }
});
