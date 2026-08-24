const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ALLOWED_ARGUMENTS = new Set([
  JSON.stringify(["--dir"]),
  JSON.stringify(["--win", "msi"])
]);

function assertBuilderArguments(args) {
  if (!ALLOWED_ARGUMENTS.has(JSON.stringify(args))) {
    throw new Error(`Refusing unsupported builder arguments: ${args.join(" ")}`);
  }

  return args;
}

function getBuilderArguments(args) {
  return [...assertBuilderArguments(args), "--publish", "never"];
}

function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const args = getBuilderArguments(process.argv.slice(2));
  const cacheRoot = path.join(projectRoot, ".cache");
  const builderCache = path.join(cacheRoot, "electron-builder");
  const tempDirectory = path.join(cacheRoot, "temp");
  const builderCli = require.resolve("electron-builder/out/cli/cli.js");

  fs.mkdirSync(builderCache, { recursive: true });
  fs.mkdirSync(tempDirectory, { recursive: true });

  const result = spawnSync(process.execPath, [builderCli, ...args], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_BUILDER_CACHE: builderCache,
      TEMP: tempDirectory,
      TMP: tempDirectory
    },
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}

if (require.main === module) {
  main();
}

module.exports = { assertBuilderArguments, getBuilderArguments };
