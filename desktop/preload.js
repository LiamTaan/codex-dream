const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("dreamSkin", {
  getStatus: () => ipcRenderer.invoke("status"),
  getPresets: () => ipcRenderer.invoke("presets"),
  performAction: (action) => ipcRenderer.invoke("action", action),
  chooseImage: () => ipcRenderer.invoke("choose-image"),
  openState: () => ipcRenderer.invoke("open-state"),
});
