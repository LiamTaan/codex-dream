const { contextBridge, ipcRenderer } = require("electron");

async function invoke(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response?.ok) {
    const error = new Error(response?.error?.message || "操作未完成");
    error.details = response?.error;
    throw error;
  }
  return response.data;
}

contextBridge.exposeInMainWorld("dreamSkin", {
  getStatus: () => invoke("status"),
  getThemes: () => invoke("themes"),
  getAppInfo: () => invoke("app-info"),
  getDiagnostics: () => invoke("diagnostics"),
  performAction: (action) => invoke("action", action),
  applyTheme: (themeId, source) => invoke("apply-theme", themeId, source),
  deleteTheme: (themeId, source) => invoke("delete-theme", themeId, source),
  updateThemeMetadata: (themeId, source, metadata) => invoke("update-theme-metadata", themeId, source, metadata),
  pickThemeImage: () => invoke("pick-theme-image"),
  createImageTheme: (imagePath, options) => invoke("create-image-theme", imagePath, options),
  openState: () => invoke("open-state"),
  openLogs: () => invoke("open-logs"),
});
