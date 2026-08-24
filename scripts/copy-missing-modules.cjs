const fs = require("node:fs");
const path = require("node:path");
const { patchHarnessRuntime } = require("./patch-harness-runtime.cjs");

const SCOPE = "@deepseek-ai";

function listScopePackages(nodeModulesPath) {
  try {
    return fs
      .readdirSync(path.join(nodeModulesPath, SCOPE), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * electron-builder derives the production dependency tree from package.json and
 * misses transitive @deepseek-ai packages that npm hoisted to the top level.
 */
function findMissingPackages(sourceNodeModules, targetNodeModules) {
  const packed = new Set(listScopePackages(targetNodeModules));

  return listScopePackages(sourceNodeModules).filter(
    (name) => !packed.has(name)
  );
}

function copyMissingPackages(sourceNodeModules, targetNodeModules) {
  const missing = findMissingPackages(sourceNodeModules, targetNodeModules);

  for (const name of missing) {
    fs.cpSync(
      path.join(sourceNodeModules, SCOPE, name),
      path.join(targetNodeModules, SCOPE, name),
      { recursive: true, dereference: true, errorOnExist: false }
    );
  }

  return missing;
}

exports.default = async function afterPack(context) {
  const projectRoot = path.resolve(__dirname, "..");
  const sourceNodeModules = path.join(projectRoot, "node_modules");
  const targetNodeModules = path.join(
    context.appOutDir,
    "resources",
    "app",
    "node_modules"
  );

  if (!fs.existsSync(targetNodeModules)) {
    throw new Error(
      `Packaged node_modules was not found: ${targetNodeModules}`
    );
  }

  const copied = copyMissingPackages(sourceNodeModules, targetNodeModules);
  console.log(
    `  restored ${copied.length} hoisted ${SCOPE} packages omitted by the dependency scan`
  );

  const remaining = findMissingPackages(sourceNodeModules, targetNodeModules);
  if (remaining.length > 0) {
    throw new Error(
      `Packages are still missing after the copy: ${remaining.join(", ")}`
    );
  }

  const patchResult = patchHarnessRuntime(targetNodeModules);
  console.log(
    `  ${patchResult.changed ? "applied" : "verified"} Harness Windows picker patch`
  );
};

module.exports.findMissingPackages = findMissingPackages;
module.exports.copyMissingPackages = copyMissingPackages;
