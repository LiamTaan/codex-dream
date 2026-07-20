const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");

const execFileAsync = promisify(execFile);
const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";

function skinRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, "skin") : path.resolve(__dirname, "..");
}
function platformRoot() { return path.join(skinRoot(), isWindows ? "windows" : "macos"); }
function scriptPath(name) { return path.join(platformRoot(), "scripts", name); }
function run(command, args, options = {}) {
  return execFileAsync(command, args, { cwd: platformRoot(), windowsHide: true, maxBuffer: 8 * 1024 * 1024, ...options });
}
function runPlatformScript(script, args = []) {
  return isWindows
    ? run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath(script), ...args])
    : run("/bin/bash", [scriptPath(script), ...args]);
}
function parseJsonOutput(stdout) {
  const candidate = String(stdout || "").trim().split(/\r?\n/).filter(Boolean).at(-1) || "{}";
  try { return JSON.parse(candidate); } catch { return { raw: String(stdout || "").trim() }; }
}

async function getStatus() {
  if (isMac) {
    try {
      const result = await runPlatformScript("status-dream-skin-macos.sh", ["--json"]);
      const data = parseJsonOutput(result.stdout);
      return { platform: "macOS", available: true, ...data };
    } catch (error) {
      return { platform: "macOS", available: false, message: error.message };
    }
  }
  try {
    const result = await runPlatformScript("desktop-actions.ps1", ["-Action", "Status"]);
    const data = parseJsonOutput(result.stdout);
    return { platform: "Windows", available: Boolean(data.installed), message: data.installed ? "Windows 运行时已就绪。" : "尚未安装 Windows 运行时。", ...data };
  } catch (error) {
    return { platform: "Windows", available: false, message: error.message };
  }
}
function listPresets() {
  const root = path.join(platformRoot(), "presets");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    const directory = path.join(root, entry.name);
    let theme = {};
    try { theme = JSON.parse(fs.readFileSync(path.join(directory, "theme.json"), "utf8")); } catch {}
    const image = path.join(directory, "background.jpg");
    return { id: entry.name, name: theme.name || entry.name, category: theme.category || "preset", image: fs.existsSync(image) ? pathToFileURL(image).href : null };
  });
}
async function chooseImage() {
  const result = await dialog.showOpenDialog({ title: "选择 Codex 主题背景", properties: ["openFile"], filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "heic", "tif", "tiff"] }] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  if (isMac) {
    await runPlatformScript("load-image-theme-macos.sh", ["--file", result.filePaths[0]]);
  } else {
    await runPlatformScript("desktop-actions.ps1", ["-Action", "ApplyImage", "-ImagePath", result.filePaths[0]]);
    await runPlatformScript("start-dream-skin.ps1", ["-PromptRestart"]);
  }
  return { canceled: false, imagePath: result.filePaths[0] };
}
async function performAction(action, value) {
  const actions = {
    start: () => isMac ? runPlatformScript("start-dream-skin-macos.sh", ["--prompt-restart"]) : runPlatformScript("start-dream-skin.ps1", ["-PromptRestart"]),
    restore: () => isMac ? runPlatformScript("restore-dream-skin-macos.sh", ["--restore-base-theme", "--restart-codex"]) : runPlatformScript("restore-dream-skin.ps1", ["-RestoreBaseTheme", "-PromptRestart"]),
    pause: async () => {
      const status = await getStatus();
      if (status.paused || status.session === "paused") {
        return isMac
          ? runPlatformScript("start-dream-skin-macos.sh", ["--prompt-restart"])
          : runPlatformScript("start-dream-skin.ps1", ["-PromptRestart"]);
      }
      return isMac
        ? runPlatformScript("pause-dream-skin-macos.sh")
        : runPlatformScript("desktop-actions.ps1", ["-Action", "Pause"]);
    },
    applyPreset: () => isMac
      ? runPlatformScript("switch-theme-macos.sh", ["--id", value])
      : runPlatformScript("desktop-actions.ps1", ["-Action", "ApplyPreset", "-ThemeId", value]).then(() => runPlatformScript("start-dream-skin.ps1", ["-PromptRestart"])),
  };
  if (!actions[action]) throw new Error(`Unknown action: ${action}`);
  const result = await actions[action]();
  return { stdout: result?.stdout || "", stderr: result?.stderr || "" };
}
function createWindow() {
  const window = new BrowserWindow({ width: 1180, height: 760, minWidth: 900, minHeight: 620, backgroundColor: "#11100f", title: "Codex Dream Skin", webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "preload.js") } });
  window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

ipcMain.handle("status", getStatus);
ipcMain.handle("presets", () => listPresets());
ipcMain.handle("action", (_event, action) => performAction(action));
ipcMain.handle("apply-preset", (_event, themeId) => performAction("applyPreset", themeId));
ipcMain.handle("choose-image", chooseImage);
ipcMain.handle("open-state", async () => {
  const statePath = isWindows
    ? path.join(process.env.LOCALAPPDATA || "", "CodexDreamSkin")
    : path.join(process.env.HOME || "", "Library", "Application Support", "CodexDreamSkinStudio");
  await shell.openPath(statePath);
  return statePath;
});
app.whenReady().then(() => { createWindow(); app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on("window-all-closed", () => { if (!isMac) app.quit(); });
