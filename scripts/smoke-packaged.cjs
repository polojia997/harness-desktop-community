const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const STARTUP_TIMEOUT_MS = 120_000;
const HEALTH_CHECK_INTERVAL_MS = 500;
const SMOKE_PREFIX = "harness-desktop-smoke-";
const DEEPSEEK_SCOPE = "@deepseek-ai";
const PICKER_PATCH_MARKER = "HARNESS_DESKTOP_WIN32_PICKER_PATCH_V2";

function reservePort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function assertSafeSmokeRoot(candidate, projectRoot) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedTestDataRoot = path.resolve(projectRoot, ".test-user-data");

  if (
    path.dirname(resolvedCandidate) !== resolvedTestDataRoot ||
    !path.basename(resolvedCandidate).startsWith(SMOKE_PREFIX)
  ) {
    throw new Error(`Refusing to clean unsafe smoke directory: ${candidate}`);
  }

  return resolvedCandidate;
}

function listDirectories(directory) {
  try {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function assertPackagedScopeComplete(sourceNodeModules, packedNodeModules) {
  const sourcePackages = listDirectories(
    path.join(sourceNodeModules, DEEPSEEK_SCOPE)
  );
  const packedPackages = new Set(
    listDirectories(path.join(packedNodeModules, DEEPSEEK_SCOPE))
  );
  const missing = sourcePackages.filter((name) => !packedPackages.has(name));

  if (missing.length > 0) {
    throw new Error(
      `Packaged app is missing ${DEEPSEEK_SCOPE} packages: ${missing.join(", ")}`
    );
  }

  return sourcePackages.length;
}

async function stopProcessTree(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform !== "win32") {
    child.kill("SIGTERM");
    return;
  }

  await new Promise((resolve) => {
    const killer = spawn(
      "taskkill",
      ["/pid", String(child.pid), "/T", "/F"],
      { windowsHide: true, stdio: "ignore" }
    );
    killer.once("exit", resolve);
    killer.once("error", resolve);
  });
}

async function waitUntilReady(origin, child, output) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(
        `Packaged Harness exited before startup.\n${output.value}`
      );
    }

    try {
      const response = await fetch(origin, {
        headers: { connection: "close" },
        redirect: "manual",
        signal: AbortSignal.timeout(2_000)
      });

      await response.body?.cancel();
      if (response.status >= 200 && response.status < 500) {
        return response.status;
      }
    } catch {
      // The runtime is still warming up.
    }

    await new Promise((resolve) =>
      setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS)
    );
  }

  throw new Error(`Packaged Harness startup timed out.\n${output.value}`);
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const { version } = require(path.join(projectRoot, "package.json"));
  const packagedRoot = path.join(
    projectRoot,
    "release",
    version,
    "win-unpacked"
  );
  const packedAppRoot = path.join(packagedRoot, "resources", "app");
  const packedNodeModules = path.join(packedAppRoot, "node_modules");
  const executable = path.join(packagedRoot, "Harness Desktop.exe");
  const entry = path.join(
    packedNodeModules,
    DEEPSEEK_SCOPE,
    "dsh",
    "lib",
    "bin.js"
  );

  for (const requiredPath of [
    executable,
    entry,
    path.join(packedAppRoot, "build", "icon.ico")
  ]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Required packaged file was not found: ${requiredPath}`);
    }
  }

  const packageCount = assertPackagedScopeComplete(
    path.join(projectRoot, "node_modules"),
    packedNodeModules
  );
  const pickerWorker = fs.readFileSync(
    path.join(
      packedNodeModules,
      DEEPSEEK_SCOPE,
      "dsh-host-directory-picker-native",
      "lib",
      "worker.cjs"
    ),
    "utf8"
  );
  assert.equal(pickerWorker.includes(PICKER_PATCH_MARKER), true);

  const testDataRoot = path.join(projectRoot, ".test-user-data");
  fs.mkdirSync(testDataRoot, { recursive: true });
  const smokeRoot = fs.mkdtempSync(path.join(testDataRoot, SMOKE_PREFIX));
  const safeSmokeRoot = assertSafeSmokeRoot(smokeRoot, projectRoot);
  const dshHome = path.join(safeSmokeRoot, "dsh-home");
  const workspace = path.join(safeSmokeRoot, "workspace");
  fs.mkdirSync(dshHome, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });

  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  const output = { value: "" };
  const child = spawn(
    executable,
    [
      "--expose-internals",
      entry,
      "web",
      "--host",
      "127.0.0.1",
      "--no-open",
      "--port",
      String(port)
    ],
    {
      cwd: workspace,
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        ELECTRON_RUN_AS_NODE: "1",
        NO_COLOR: "1"
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  const record = (chunk) => {
    output.value = `${output.value}${String(chunk)}`.slice(-8_000);
  };
  child.stdout.on("data", record);
  child.stderr.on("data", record);

  try {
    const status = await waitUntilReady(origin, child, output);
    console.log(
      `Packaged Harness responded with HTTP ${status}; verified ${packageCount} ${DEEPSEEK_SCOPE} packages.`
    );
  } finally {
    await stopProcessTree(child);
    fs.rmSync(assertSafeSmokeRoot(safeSmokeRoot, projectRoot), {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200
    });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { assertPackagedScopeComplete, assertSafeSmokeRoot };
