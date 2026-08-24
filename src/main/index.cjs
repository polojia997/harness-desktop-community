const path = require("node:path");

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell
} = require("electron");

const { HarnessRuntime } = require("./runtime-manager.cjs");
const { DesktopSettings } = require("./settings.cjs");
const { isTrustedAppUrl } = require("./runtime-utils.cjs");

let mainWindow;
let runtime;
let runtimeStartPromise;
let settings;
let latestState = {
  status: "needs-workspace",
  detail: "请选择一个具体的项目目录后启动 Harness。",
  origin: null,
  workspacePath: null
};

function isAllowedExternalUrl(candidate) {
  try {
    return ["https:", "http:", "mailto:"].includes(new URL(candidate).protocol);
  } catch {
    return false;
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function sendState(state) {
  latestState = {
    ...state,
    workspacePath: settings?.getWorkspacePath() || null
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:state", latestState);
  }
}

function installNavigationGuards(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!runtime?.origin || !isTrustedAppUrl(url, runtime.origin)) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) {
        shell.openExternal(url);
      }
    }
  });
}

async function createWindow() {
  const windowIcon = path.join(app.getAppPath(), "build", "icon.ico");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: "#f4f5f7",
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  installNavigationGuards(mainWindow);
  await mainWindow.loadFile(
    path.join(__dirname, "..", "renderer", "loading.html")
  );
  mainWindow.show();
}

async function showLoadingPage() {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    mainWindow.webContents.getURL().startsWith("file:")
  ) {
    return;
  }

  await mainWindow.loadFile(
    path.join(__dirname, "..", "renderer", "loading.html")
  );
}

async function performStartRuntime() {
  if (runtime) {
    await runtime.stop();
  }

  await showLoadingPage();

  const workspacePath = settings.getWorkspacePath();
  if (!workspacePath) {
    runtime = null;
    sendState({
      status: "needs-workspace",
      detail: "请选择一个具体的项目目录后启动 Harness。",
      origin: null
    });
    return null;
  }

  runtime = new HarnessRuntime({
    appPath: app.getAppPath(),
    dshHomePath: path.join(app.getPath("userData"), "dsh-home"),
    logPath: path.join(app.getPath("logs"), "harness-runtime.log"),
    workspacePath
  });
  runtime.on("state", sendState);

  try {
    const origin = await runtime.start();
    await mainWindow.loadURL(origin);
    return origin;
  } catch (error) {
    await runtime.stop();
    sendState({
      status: "error",
      detail: error instanceof Error ? error.message : String(error),
      origin: null
    });
    return null;
  }
}

function startRuntime() {
  if (!runtimeStartPromise) {
    runtimeStartPromise = performStartRuntime().finally(() => {
      runtimeStartPromise = null;
    });
  }

  return runtimeStartPromise;
}

async function chooseWorkspace() {
  let result;
  const testWorkspacePath =
    !app.isPackaged && process.env.HARNESS_DESKTOP_TEST_WORKSPACE;

  if (testWorkspacePath) {
    result = { canceled: false, filePaths: [testWorkspacePath] };
  } else {
    try {
      result = await dialog.showOpenDialog(mainWindow, {
        title: "选择 Harness 工作目录",
        defaultPath: settings.getWorkspacePath() || app.getPath("documents"),
        properties: ["openDirectory", "createDirectory"]
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      sendState({ status: "error", detail, origin: null });
      throw error;
    }
  }

  if (result.canceled || !result.filePaths[0]) {
    return settings.getWorkspacePath();
  }

  try {
    settings.setWorkspacePath(result.filePaths[0]);
  } catch (error) {
    await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "不能使用这个目录",
      message: error instanceof Error ? error.message : String(error),
      detail: "请选择专门用于项目的文件夹。"
    });
    return settings.getWorkspacePath();
  }

  const workspacePath = result.filePaths[0];
  sendState({
    status: "starting",
    detail: "工作目录已保存，正在启动 Harness...",
    origin: null
  });
  setImmediate(() => {
    startRuntime().catch((error) => {
      sendState({
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
        origin: null
      });
    });
  });
  return workspacePath;
}

function buildApplicationMenu() {
  const template = [
    {
      label: "文件",
      submenu: [
        {
          label: "切换工作目录...",
          accelerator: "Ctrl+Shift+O",
          click: chooseWorkspace
        },
        {
          label: "重新启动 Harness",
          accelerator: "Ctrl+Shift+R",
          click: startRuntime
        },
        { type: "separator" },
        { role: "quit", label: "退出" }
      ]
    },
    {
      label: "查看",
      submenu: [
        { role: "reload", label: "刷新" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { role: "togglefullscreen", label: "全屏" }
      ]
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "打开日志目录",
          click: () => shell.openPath(app.getPath("logs"))
        },
        {
          label: "DeepSeek Harness 项目主页",
          click: () =>
            shell.openExternal(
              "https://github.com/deepseek-ai/deepseek-harness"
            )
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("desktop:get-state", () => ({
  ...latestState,
  workspacePath: settings.getWorkspacePath(),
  versions: {
    desktop: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    harness: "0.1.1-rc.2"
  }
}));
ipcMain.handle("desktop:choose-workspace", chooseWorkspace);
ipcMain.handle("desktop:retry", startRuntime);
ipcMain.handle("desktop:open-logs", () => shell.openPath(app.getPath("logs")));

app.on("second-instance", () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  app.setAppUserModelId("community.harness.desktop");
  settings = new DesktopSettings(app.getPath("userData"), {
    protectedWorkspacePaths: [
      app.getPath("home"),
      process.env.SystemRoot,
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      process.env.ProgramData
    ]
  });
  await createWindow();
  buildApplicationMenu();
  await startRuntime();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
    await startRuntime();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (!runtime?.child || runtime.stopping) {
    return;
  }

  event.preventDefault();
  runtime.stop().finally(() => app.quit());
});
