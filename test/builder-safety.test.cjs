const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertBuilderArguments
} = require("../scripts/run-builder.cjs");

test("builder accepts only unpacked and MSI targets", () => {
  assert.deepEqual(assertBuilderArguments(["--dir"]), ["--dir"]);
  assert.deepEqual(assertBuilderArguments(["--win", "msi"]), [
    "--win",
    "msi"
  ]);
});

test("builder rejects arbitrary output and publish arguments", () => {
  assert.throws(
    () => assertBuilderArguments(["--config.directories.output=C:\\"]),
    /Refusing unsupported builder arguments/
  );
  assert.throws(
    () => assertBuilderArguments(["--publish", "always"]),
    /Refusing unsupported builder arguments/
  );
});
