const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_NAME = "@deepseek-ai/dsh-host-directory-picker-native";
const PATCH_MARKER = "HARNESS_DESKTOP_WIN32_PICKER_PATCH_V2";

function replaceRequired(source, search, replacement, description) {
  if (source.includes(replacement)) {
    return source;
  }

  if (!source.includes(search)) {
    throw new Error(`Cannot apply ${description}: expected source was not found.`);
  }

  return source.replace(search, replacement);
}

function replaceOneOf(source, searches, replacement, description) {
  if (source.includes(replacement)) {
    return source;
  }

  const search = searches.find((candidate) => source.includes(candidate));
  if (!search) {
    throw new Error(`Cannot apply ${description}: expected source was not found.`);
  }

  return source.replace(search, replacement);
}

function patchWorkerSource(source) {
  const withoutLegacyLengthBinding = source.replace(
    `\n\tconst lstrlenW = kernel32.func("__stdcall", "lstrlenW", "int", ["void *"]);`,
    ""
  );

  if (source.includes(PATCH_MARKER)) {
    return withoutLegacyLengthBinding;
  }

  let patched = replaceOneOf(
    withoutLegacyLengthBinding,
    [
      `function readUtf16(koffi, address) {
\tconst bytes = Buffer.from(koffi.view(address, 32768));
\tlet end = 0;
\twhile (end + 1 < bytes.length && bytes[end] !== 0) end += 2;
\treturn bytes.toString("utf16le", 0, end);
}`,
      `function readUtf16(koffi, address, length) {
\t// HARNESS_DESKTOP_WIN32_PICKER_PATCH: only view the allocation's actual UTF-16 length.
\tconst bytes = Buffer.from(koffi.view(address, length * 2));
\treturn bytes.toString("utf16le");
}`
    ],
    `function readUtf16(wideCharToMultiByte, address) {
\t// ${PATCH_MARKER}: copy native UTF-16 memory through Win32 instead of
\t// exposing the COM allocation with koffi.view(), which can crash Electron.
\tconst byteLength = wideCharToMultiByte(65001, 0, address, -1, null, 0, null, null);
\tif (byteLength <= 0) throw new Error("WideCharToMultiByte size query failed");
\tconst bytes = Buffer.alloc(byteLength);
\tconst written = wideCharToMultiByte(65001, 0, address, -1, bytes, bytes.length, null, null);
\tif (written <= 0) throw new Error("WideCharToMultiByte conversion failed");
\treturn bytes.toString("utf8", 0, written - 1);
}`,
    "safe UTF-16 path reader"
  );

  patched = replaceOneOf(
    patched,
    [
      `\tconst kernel32 = koffi.load("kernel32.dll");
\tconst pointerSize = koffi.sizeof("void *");`,
      `\tconst kernel32 = koffi.load("kernel32.dll");
\tconst pointerSize = koffi.sizeof("void *");
\tconst lstrlenW = kernel32.func("__stdcall", "lstrlenW", "int", ["void *"]);`
    ],
    `\tconst kernel32 = koffi.load("kernel32.dll");
\tconst pointerSize = koffi.sizeof("void *");
\tconst wideCharToMultiByte = kernel32.func("__stdcall", "WideCharToMultiByte", "int", [
\t\t"uint32",
\t\t"uint32",
\t\t"void *",
\t\t"int32",
\t\t"void *",
\t\t"int32",
\t\t"void *",
\t\t"void *"
\t]);`,
    "WideCharToMultiByte binding"
  );

  patched = replaceOneOf(
    patched,
    [
      `\t\t\t\t\t\tconst path = readUtf16(koffi, nameOut[0]);
\t\t\t\t\t\tcoTaskMemFree(nameOut[0]);
\t\t\t\t\t\treturn {
\t\t\t\t\t\t\thr: gotName,
\t\t\t\t\t\t\tpath
\t\t\t\t\t\t};`,
      `\t\t\t\t\t\tlet path;
\t\t\t\t\t\ttry {
\t\t\t\t\t\t\tpath = readUtf16(koffi, nameOut[0], lstrlenW(nameOut[0]));
\t\t\t\t\t\t} finally {
\t\t\t\t\t\t\tcoTaskMemFree(nameOut[0]);
\t\t\t\t\t\t}
\t\t\t\t\t\treturn {
\t\t\t\t\t\t\thr: gotName,
\t\t\t\t\t\t\tpath
\t\t\t\t\t\t};`
    ],
    `\t\t\t\t\t\tlet path;
\t\t\t\t\t\ttry {
\t\t\t\t\t\t\tpath = readUtf16(wideCharToMultiByte, nameOut[0]);
\t\t\t\t\t\t} finally {
\t\t\t\t\t\t\tcoTaskMemFree(nameOut[0]);
\t\t\t\t\t\t}
\t\t\t\t\t\treturn {
\t\t\t\t\t\t\thr: gotName,
\t\t\t\t\t\t\tpath
\t\t\t\t\t\t};`,
    "bounded path extraction"
  );

  if (patched.includes("bindings.coUninitialize();")) {
    patched = replaceRequired(
      patched,
      `\tcheck(bindings.coInitializeSta(), "CoInitializeEx");
\ttry {
\t\tconst dialog = bindings.createFolderDialog();
\t\ttry {`,
      `\tcheck(bindings.coInitializeSta(), "CoInitializeEx");
\t// The worker exits after one dialog, so COM teardown is unnecessary and
\t// crashes some Electron-hosted Node processes after a successful selection.
\tconst dialog = bindings.createFolderDialog();
\ttry {`,
      "COM teardown avoidance"
    );

    patched = replaceRequired(
      patched,
      `\t\t} finally {
\t\t\tdialog.release();
\t\t}
\t} finally {
\t\tbindings.coUninitialize();
\t}
}`,
      `\t} finally {
\t\tdialog.release();
\t}
}`,
      "COM teardown removal"
    );
  }

  return patched;
}

function patchIndexSource(source) {
  if (source.includes(`${PATCH_MARKER}: windowsHide`)) {
    return source;
  }

  const matches = source.match(/\t\twindowsHide: true/g) || [];
  if (matches.length === 0 && source.includes("windowsHide: false")) {
    return source.replace(
      /HARNESS_DESKTOP_WIN32_PICKER_PATCH(?=: windowsHide)/g,
      PATCH_MARKER
    );
  }
  if (matches.length !== 2) {
    throw new Error(
      `Cannot apply dialog visibility patch: expected 2 matches, found ${matches.length}.`
    );
  }

  return source.replace(
    /\t\twindowsHide: true/g,
    `\t\twindowsHide: false // ${PATCH_MARKER}: windowsHide`
  );
}

function patchHarnessRuntime(nodeModulesPath) {
  const packageRoot = path.join(nodeModulesPath, ...PACKAGE_NAME.split("/"));
  const workerPath = path.join(packageRoot, "lib", "worker.cjs");
  const indexPath = path.join(packageRoot, "lib", "index.js");

  for (const requiredPath of [workerPath, indexPath]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Harness directory picker file was not found: ${requiredPath}`);
    }
  }

  const workerSource = fs.readFileSync(workerPath, "utf8");
  const indexSource = fs.readFileSync(indexPath, "utf8");
  const patchedWorker = patchWorkerSource(workerSource);
  const patchedIndex = patchIndexSource(indexSource);

  if (patchedWorker !== workerSource) {
    fs.writeFileSync(workerPath, patchedWorker, "utf8");
  }
  if (patchedIndex !== indexSource) {
    fs.writeFileSync(indexPath, patchedIndex, "utf8");
  }

  return {
    packageRoot,
    changed: patchedWorker !== workerSource || patchedIndex !== indexSource
  };
}

function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const result = patchHarnessRuntime(path.join(projectRoot, "node_modules"));
  console.log(
    `${result.changed ? "Applied" : "Verified"} Harness Windows picker patch.`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  PATCH_MARKER,
  patchHarnessRuntime,
  patchIndexSource,
  patchWorkerSource
};
