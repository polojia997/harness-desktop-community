const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  assertSafeSmokeRoot
} = require("../scripts/smoke-packaged.cjs");

test("smoke cleanup accepts only a prefixed direct child of project test data", () => {
  const projectRoot = path.resolve(__dirname, "..");
  const candidate = path.join(
    projectRoot,
    ".test-user-data",
    "harness-desktop-smoke-test"
  );
  assert.equal(
    assertSafeSmokeRoot(candidate, projectRoot),
    path.resolve(candidate)
  );
});

test("smoke cleanup rejects the user home directory", () => {
  const projectRoot = path.resolve(__dirname, "..");
  assert.throws(
    () => assertSafeSmokeRoot(projectRoot, projectRoot),
    /Refusing to clean unsafe smoke directory/
  );
});

test("smoke cleanup rejects nested and unprefixed project test directories", () => {
  const projectRoot = path.resolve(__dirname, "..");
  assert.throws(
    () =>
      assertSafeSmokeRoot(
        path.join(
          projectRoot,
          ".test-user-data",
          "harness-desktop-smoke-parent",
          "nested"
        ),
        projectRoot
      ),
    /Refusing to clean unsafe smoke directory/
  );
  assert.throws(
    () =>
      assertSafeSmokeRoot(
        path.join(projectRoot, ".test-user-data", "other-test"),
        projectRoot
      ),
    /Refusing to clean unsafe smoke directory/
  );
});
