const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const os = require("node:os");

const {
  getDshEntry,
  isProtectedWorkspacePath,
  isTrustedAppUrl,
  reservePort
} = require("../src/main/runtime-utils.cjs");

test("getDshEntry points at the pinned package CLI", () => {
  const result = getDshEntry("C:\\app");
  assert.equal(
    result,
    path.join(
      "C:\\app",
      "node_modules",
      "@deepseek-ai",
      "dsh",
      "lib",
      "bin.js"
    )
  );
});

test("isTrustedAppUrl accepts only the runtime origin", () => {
  const origin = "http://127.0.0.1:3080";
  assert.equal(isTrustedAppUrl(`${origin}/sessions`, origin), true);
  assert.equal(isTrustedAppUrl("https://example.com", origin), false);
  assert.equal(isTrustedAppUrl("not a url", origin), false);
});

test("reservePort returns an available TCP port", async () => {
  const port = await reservePort();
  assert.equal(Number.isInteger(port), true);
  assert.equal(port > 0, true);
});

test("protected workspace paths reject roots and the user home", () => {
  const homeDirectory = os.homedir();

  assert.equal(isProtectedWorkspacePath(path.parse(homeDirectory).root), true);
  assert.equal(
    isProtectedWorkspacePath(homeDirectory, [homeDirectory]),
    true
  );
  assert.equal(
    isProtectedWorkspacePath(
      path.join(homeDirectory, "source", "project"),
      [homeDirectory]
    ),
    false
  );
  assert.equal(isProtectedWorkspacePath("relative-project"), true);
});
