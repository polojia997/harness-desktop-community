const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  assertSafeTestRoot
} = require("../scripts/smoke-first-launch.cjs");

test("first-launch cleanup accepts only its prefixed test-data child", () => {
  const projectRoot = path.resolve(__dirname, "..");
  const candidate = path.join(
    projectRoot,
    ".test-user-data",
    "first-launch-test"
  );

  assert.equal(
    assertSafeTestRoot(candidate, projectRoot),
    path.resolve(candidate)
  );
});

test("first-launch cleanup rejects project and user directories", () => {
  const projectRoot = path.resolve(__dirname, "..");

  assert.throws(
    () => assertSafeTestRoot(projectRoot, projectRoot),
    /Refusing to clean unsafe test directory/
  );
  assert.throws(
    () =>
      assertSafeTestRoot(
        path.join(projectRoot, ".test-user-data", "other-test"),
        projectRoot
      ),
    /Refusing to clean unsafe test directory/
  );
});
