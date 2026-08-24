const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { getDshEntry, reservePort } = require("./runtime-utils.cjs");

const STARTUP_TIMEOUT_MS = 120_000;
const HEALTH_CHECK_INTERVAL_MS = 500;

class HarnessRuntime extends EventEmitter {
  constructor({ appPath, dshHomePath, logPath, workspacePath }) {
    super();
    this.appPath = appPath;
    this.dshHomePath = dshHomePath;
    this.logPath = logPath;
    this.workspacePath = workspacePath;
    this.child = null;
    this.origin = null;
    this.stopping = false;
    this.lastOutput = "";
  }

  updateState(status, detail = "") {
    const state = { status, detail, origin: this.origin };
    this.emit("state", state);
    return state;
  }

  recordOutput(source, chunk) {
    const detail = String(chunk).trim();
    if (!detail) {
      return;
    }

    this.lastOutput = detail.slice(-4_000);

    try {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
      fs.appendFileSync(
        this.logPath,
        `[${new Date().toISOString()}] [${source}] ${detail}\n`,
        "utf8"
      );
    } catch {
      // Logging must never prevent Harness from starting.
    }

    this.updateState("starting", detail);
  }

  async start() {
    if (this.child) {
      return this.origin;
    }

    this.stopping = false;
    this.lastOutput = "";
    this.updateState("starting", "正在准备 Harness 运行环境...");

    const entry = getDshEntry(this.appPath);
    if (!fs.existsSync(entry)) {
      throw new Error(`Harness CLI entry was not found: ${entry}`);
    }

    const port = await reservePort();
    this.origin = `http://127.0.0.1:${port}`;

    const env = {
      ...process.env,
      DSH_HOME: this.dshHomePath,
      ELECTRON_RUN_AS_NODE: "1",
      NO_COLOR: "1"
    };

    this.child = spawn(
      process.execPath,
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
        cwd: this.workspacePath,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    this.child.stdout.on("data", (chunk) => {
      this.recordOutput("stdout", chunk);
    });

    this.child.stderr.on("data", (chunk) => {
      this.recordOutput("stderr", chunk);
    });

    this.child.once("error", (error) => {
      this.recordOutput("process-error", error.message);
      this.child = null;
      this.updateState("error", error.message);
    });

    this.child.once("exit", (code, signal) => {
      this.child = null;
      if (!this.stopping) {
        const detail = `Harness exited unexpectedly (code=${code}, signal=${signal || "none"}).`;
        this.recordOutput("exit", detail);
        this.updateState("error", detail);
      }
    });

    await this.waitUntilReady();
    this.updateState("ready", "Harness 已启动。");
    return this.origin;
  }

  async waitUntilReady() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
      if (!this.child) {
        throw new Error(
          this.lastOutput ||
            "Harness stopped before the web interface was ready."
        );
      }

      try {
        const response = await fetch(this.origin, {
          headers: { connection: "close" },
          redirect: "manual",
          signal: AbortSignal.timeout(2_000)
        });

        if (response.status >= 200 && response.status < 500) {
          await response.body?.cancel();
          return;
        }

        await response.body?.cancel();
      } catch {
        // The runtime is still warming up.
      }

      await new Promise((resolve) =>
        setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS)
      );
    }

    throw new Error("Harness startup timed out after 120 seconds.");
  }

  async stop() {
    const child = this.child;
    if (!child) {
      return;
    }

    this.stopping = true;
    this.updateState("stopping", "正在关闭 Harness...");

    const terminate = new Promise((resolve) => {
      if (process.platform !== "win32") {
        child.once("exit", resolve);
        child.kill();
        setTimeout(resolve, 3_000);
        return;
      }

      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" }
      );
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });

    await Promise.race([
      terminate,
      new Promise((resolve) => setTimeout(resolve, 5_000))
    ]);

    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
    this.child = null;
    this.origin = null;
    this.updateState("stopped", "Harness 已关闭。");
  }
}

module.exports = { HarnessRuntime };
