const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const STARTUP_TIMEOUT_MS = 120_000;
const TEST_PREFIX = "first-launch-";

function reservePort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function assertSafeTestRoot(candidate, projectRoot) {
  const resolvedCandidate = path.resolve(candidate);
  const testDataRoot = path.resolve(projectRoot, ".test-user-data");

  if (
    path.dirname(resolvedCandidate) !== testDataRoot ||
    !path.basename(resolvedCandidate).startsWith(TEST_PREFIX)
  ) {
    throw new Error(`Refusing to clean unsafe test directory: ${candidate}`);
  }

  return resolvedCandidate;
}

async function getPageTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(1_000)
  });
  return response.json();
}

async function waitForPageTarget(port, child, predicate, description) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(`Electron exited before startup (code=${child.exitCode}).`);
    }

    try {
      const targets = await getPageTargets(port);
      const target = targets.find(
        (candidate) => candidate.type === "page" && predicate(candidate)
      );

      if (target) {
        return target;
      }
    } catch {
      // Electron or Harness is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

function connectDevTools(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    let nextId = 1;

    socket.addEventListener("open", () => {
      resolve({
        close: () => socket.close(),
        send(method, params = {}) {
          const id = nextId++;
          return new Promise((resolveCommand, rejectCommand) => {
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
            socket.send(JSON.stringify({ id, method, params }));
          });
        }
      });
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !pending.has(message.id)) {
        return;
      }

      const command = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        command.reject(new Error(message.error.message));
      } else {
        command.resolve(message.result);
      }
    });

    socket.addEventListener("error", () => {
      reject(new Error("Failed to connect to the Electron DevTools endpoint."));
    });
  });
}

async function readFirstLaunchState(devTools) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10_000) {
    const evaluation = await devTools.send("Runtime.evaluate", {
      expression: `JSON.stringify({
        status: document.querySelector("#status")?.textContent,
        detail: document.querySelector("#detail")?.textContent,
        workspace: document.querySelector("#workspace")?.textContent
      })`,
      returnByValue: true
    });

    if (evaluation.exceptionDetails) {
      throw new Error(
        evaluation.exceptionDetails.exception?.description ||
          evaluation.exceptionDetails.text
      );
    }

    if (typeof evaluation.result.value === "string") {
      const state = JSON.parse(evaluation.result.value);
      if (state.status && state.workspace) {
        return state;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for first-launch page content.");
}

async function stopProcessTree(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return;
  }

  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const testDataRoot = path.join(projectRoot, ".test-user-data");
  const testRoot = path.join(testDataRoot, `${TEST_PREFIX}${Date.now()}`);
  const workspace = path.join(testRoot, "workspace");
  const artifactDirectory = path.join(projectRoot, "test-artifacts");
  const screenshotPath = path.join(artifactDirectory, "first-launch.png");
  const electronPath = require("electron");
  const port = await reservePort();
  const env = {
    ...process.env,
    HARNESS_DESKTOP_TEST_WORKSPACE: workspace
  };
  delete env.ELECTRON_RUN_AS_NODE;

  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(artifactDirectory, { recursive: true });

  const child = spawn(
    electronPath,
    [
      projectRoot,
      `--user-data-dir=${testRoot}`,
      `--remote-debugging-port=${port}`
    ],
    {
      cwd: projectRoot,
      env,
      windowsHide: true,
      stdio: "ignore"
    }
  );

  let devTools;
  try {
    const loadingTarget = await waitForPageTarget(
      port,
      child,
      (candidate) => candidate.url.includes("/src/renderer/loading.html"),
      "the first-launch page"
    );
    devTools = await connectDevTools(loadingTarget.webSocketDebuggerUrl);
    await devTools.send("Page.enable");

    const state = await readFirstLaunchState(devTools);

    assert.equal(state.status, "请选择工作目录");
    assert.equal(state.workspace, "未选择");
    assert.match(state.detail, /请选择一个具体的项目目录/);
    assert.equal(fs.existsSync(path.join(testRoot, "dsh-home")), false);

    const screenshot = await devTools.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    fs.writeFileSync(screenshotPath, screenshot.data, "base64");

    await devTools.send("Runtime.evaluate", {
      expression: `document.querySelector("#choose-workspace").click()`
    });

    const harnessTarget = await waitForPageTarget(
      port,
      child,
      (candidate) => candidate.url.startsWith("http://127.0.0.1:"),
      "Harness after selecting a workspace"
    );
    const settings = JSON.parse(
      fs.readFileSync(path.join(testRoot, "desktop-settings.json"), "utf8")
    );
    assert.equal(path.resolve(settings.workspacePath), path.resolve(workspace));

    const response = await fetch(harnessTarget.url, {
      signal: AbortSignal.timeout(5_000)
    });
    assert.equal(response.status >= 200 && response.status < 500, true);
    await response.body?.cancel();

    console.log(
      `Workspace selection and first launch passed: ${screenshotPath}`
    );
  } finally {
    devTools?.close();
    await stopProcessTree(child);
    fs.rmSync(assertSafeTestRoot(testRoot, projectRoot), {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 300
    });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { assertSafeTestRoot };
