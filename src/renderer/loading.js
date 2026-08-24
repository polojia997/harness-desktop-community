const statusElement = document.querySelector("#status");
const detailElement = document.querySelector("#detail");
const workspaceElement = document.querySelector("#workspace");
const versionElement = document.querySelector("#version");
const retryButton = document.querySelector("#retry");
const chooseWorkspaceButton = document.querySelector("#choose-workspace");
const openLogsButton = document.querySelector("#open-logs");

const labels = {
  "needs-workspace": "请选择工作目录",
  starting: "正在启动",
  ready: "启动完成",
  stopping: "正在关闭",
  stopped: "已关闭",
  error: "启动失败"
};

function render(state) {
  statusElement.textContent = labels[state.status] || state.status;
  detailElement.textContent = state.detail || "";
  retryButton.hidden = state.status !== "error";
  chooseWorkspaceButton.textContent =
    state.status === "needs-workspace" ? "选择项目目录" : "切换项目目录";

  if (state.workspacePath) {
    workspaceElement.textContent = state.workspacePath;
  } else {
    workspaceElement.textContent = "未选择";
  }

  if (state.versions) {
    versionElement.textContent = state.versions.harness;
  }
}

chooseWorkspaceButton.addEventListener("click", async () => {
  chooseWorkspaceButton.disabled = true;
  try {
    const workspacePath = await window.desktop.chooseWorkspace();
    if (workspacePath) {
      workspaceElement.textContent = workspacePath;
    }
  } catch (error) {
    render({
      status: "error",
      detail: `无法选择工作目录：${error instanceof Error ? error.message : String(error)}`,
      workspacePath:
        workspaceElement.textContent === "未选择"
          ? null
          : workspaceElement.textContent
    });
  } finally {
    chooseWorkspaceButton.disabled = false;
  }
});

retryButton.addEventListener("click", () => window.desktop.retry());
openLogsButton.addEventListener("click", () => window.desktop.openLogs());

window.desktop.onState(render);
window.desktop.getState().then(render).catch((error) => {
  render({
    status: "error",
    detail: error instanceof Error ? error.message : String(error),
    workspacePath: null
  });
});
