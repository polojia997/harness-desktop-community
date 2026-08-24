const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { fork, spawn } = require("node:child_process");

const TIMEOUT_MS = 20_000;
const TEST_PREFIX = "native-picker-";

function stopProcessTree(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore"
  }).unref();
}

async function main() {
  if (process.platform !== "win32") {
    console.log("Native picker smoke test is Windows-only.");
    return;
  }

  const projectRoot = path.resolve(__dirname, "..");
  const testDataRoot = path.join(projectRoot, ".test-user-data");
  fs.mkdirSync(testDataRoot, { recursive: true });
  const targetPath = fs.mkdtempSync(path.join(testDataRoot, TEST_PREFIX));
  const workerPath =
    process.env.HARNESS_PICKER_WORKER ||
    path.join(
      projectRoot,
      "node_modules",
      "@deepseek-ai",
      "dsh-host-directory-picker-native",
      "lib",
      "worker.cjs"
    );
  const title = `Harness picker smoke ${Date.now()}`;
  const electronPath =
    process.env.HARNESS_PICKER_EXECUTABLE || require("electron");
  const output = [];

  const child = fork(workerPath, [], {
    execPath: electronPath,
    env: {
      ...process.env,
      DSH_DIALOG_TITLE: title,
      ELECTRON_RUN_AS_NODE: "1"
    },
    silent: true,
    windowsHide: false
  });

  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));

  let automation;
  const result = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Native picker timed out.\n${output.join("")}`));
    }, TIMEOUT_MS);

    child.on("message", (message) => {
      if (message.kind === "showing") {
        automation = spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-STA",
            "-WindowStyle",
            "Hidden",
            "-File",
            path.join(__dirname, "select-folder-dialog.ps1"),
            "-ProcessId",
            String(child.pid),
            "-FolderPath",
            targetPath
          ],
          { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
        );
        automation.stderr.on("data", (chunk) => output.push(chunk.toString()));
        return;
      }

      if (message.kind === "done") {
        clearTimeout(timeout);
        resolve(message.path);
        return;
      }

      if (message.kind === "error") {
        clearTimeout(timeout);
        reject(new Error(message.message));
      }
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("exit", (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(
          new Error(
            `Native picker worker exited with code ${code}.\n${output.join("")}`
          )
        );
      }
    });
  });

  try {
    const selectedPath = await result;
    assert.equal(typeof selectedPath, "string");
    assert.equal(fs.statSync(selectedPath).isDirectory(), true);
    console.log(`Native folder picker returned: ${selectedPath}`);
  } finally {
    automation?.kill();
    stopProcessTree(child);
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
