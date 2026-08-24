const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getState: () => ipcRenderer.invoke("desktop:get-state"),
  chooseWorkspace: () => ipcRenderer.invoke("desktop:choose-workspace"),
  retry: () => ipcRenderer.invoke("desktop:retry"),
  openLogs: () => ipcRenderer.invoke("desktop:open-logs"),
  onState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("desktop:state", handler);
    return () => ipcRenderer.removeListener("desktop:state", handler);
  }
});
