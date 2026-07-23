const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");
const { friendlyError, listThemePacks, normalizeThemeMetadata, normalizeThemeOptions } = require("./runtime-utils");

const execFileAsync = promisify(execFile);
const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";
const approvedImagePaths = new Set();

function sourceSkinRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, "skin") : path.resolve(__dirname, "..");
}
function sourcePlatformRoot() { return path.join(sourceSkinRoot(), isWindows ? "windows" : "macos"); }
function runtimeVersion() {
  try { return fs.readFileSync(path.join(sourcePlatformRoot(), "VERSION"), "utf8").trim(); }
  catch { return "unknown"; }
}
function stateRoot() {
  return isWindows
    ? path.join(process.env.LOCALAPPDATA || "", "CodexDreamSkin")
    : path.join(process.env.HOME || "", "Library", "Application Support", "CodexDreamSkinStudio");
}
function codexConfigPath() {
  const home = isWindows ? process.env.USERPROFILE : process.env.HOME;
  return path.join(home || "", ".codex", "config.toml");
}
function activeThemeRoot() { return path.join(stateRoot(), "theme"); }
function statePath() { return path.join(stateRoot(), "state.json"); }
function installedPlatformRoot() {
  return isWindows
    ? path.join(process.env.LOCALAPPDATA || "", "CodexDreamSkin", "engine")
    : path.join(process.env.HOME || "", ".codex", "codex-dream-skin-studio");
}
function installedRuntimeVersion() {
  try { return fs.readFileSync(path.join(installedPlatformRoot(), "VERSION"), "utf8").trim(); }
  catch { return "unknown"; }
}
function runtimeFilesPresent() {
  const requiredScripts = isWindows
    ? ["start-dream-skin.ps1", "desktop-actions.ps1"]
    : ["start-dream-skin-macos.sh", "status-dream-skin-macos.sh", "desktop-actions-macos.sh"];
  return requiredScripts.every((script) => fs.existsSync(path.join(installedPlatformRoot(), "scripts", script)));
}
function installationComplete() {
  const marker = isWindows
    ? path.join(stateRoot(), "config.before-dream-skin.toml.appearance.json")
    : path.join(stateRoot(), "theme-backup.json");
  const requiredVersion = runtimeVersion();
  const currentVersion = installedRuntimeVersion();
  return runtimeFilesPresent() && fs.existsSync(marker)
    && (requiredVersion === "unknown" || requiredVersion === currentVersion);
}
function platformRoot(useSource = false) {
  // Development builds must execute the checked-out scripts so fixes are testable
  // immediately; packaged builds continue to use the managed runtime copy.
  return useSource || !app.isPackaged || !runtimeFilesPresent() ? sourcePlatformRoot() : installedPlatformRoot();
}
function scriptPath(name, useSource = false) { return path.join(platformRoot(useSource), "scripts", name); }
function run(command, args, options = {}) {
  return execFileAsync(command, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024, ...options });
}
function runPlatformScript(script, args = [], useSource = false) {
  const root = platformRoot(useSource);
  return isWindows
    ? run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath(script, useSource), ...args], { cwd: root })
    : run("/bin/bash", [scriptPath(script, useSource), ...args], { cwd: root });
}
function parseJsonOutput(stdout) {
  const candidate = String(stdout || "").trim().split(/\r?\n/).filter(Boolean).at(-1) || "{}";
  try { return JSON.parse(candidate); } catch { return { raw: String(stdout || "").trim() }; }
}

async function getPreflight() {
  try {
    const result = isWindows
      ? await runPlatformScript("desktop-actions.ps1", ["-Action", "Preflight"], true)
      : await runPlatformScript("desktop-actions-macos.sh", ["--action", "preflight"], true);
    return parseJsonOutput(result.stdout);
  } catch (error) {
    return { codexInstalled: false, codexRunning: false, error: friendlyError(error) };
  }
}

async function getStatus(deep = false) {
  const preflight = await getPreflight();
  if (!installationComplete()) {
    const partial = runtimeFilesPresent();
    const requiredVersion = runtimeVersion();
    const currentVersion = installedRuntimeVersion();
    const upgradeRequired = partial && requiredVersion !== "unknown" && currentVersion !== requiredVersion;
    return {
      platform: isWindows ? "Windows" : "macOS",
      available: false,
      installed: false,
      runtimeFilesPresent: partial,
      runtimeVersion: requiredVersion,
      installedRuntimeVersion: currentVersion,
      upgradeRequired,
      ...preflight,
      session: "not-installed",
      message: upgradeRequired
        ? `检测到旧运行时 v${currentVersion}，需要更新到 v${requiredVersion}。`
        : partial
        ? "运行时文件已准备，但安装尚未完成。关闭 Codex 后可继续安装。"
        : "首次使用需要安装换肤运行时。",
    };
  }
  try {
    const result = isMac
      ? await runPlatformScript("status-dream-skin-macos.sh", deep ? ["--json", "--deep"] : ["--json"])
      : await runPlatformScript("desktop-actions.ps1", ["-Action", "Status"]);
    const data = parseJsonOutput(result.stdout);
    return {
      platform: isWindows ? "Windows" : "macOS",
      available: true,
      installed: true,
      runtimeVersion: runtimeVersion(),
      installedRuntimeVersion: installedRuntimeVersion(),
      upgradeRequired: false,
      ...preflight,
      ...data,
      message: data.operationMessage || "运行时已安装，可以应用或切换主题。",
    };
  } catch (error) {
    return { platform: isWindows ? "Windows" : "macOS", available: false, installed: true, ...preflight, error: friendlyError(error) };
  }
}

function listThemes() {
  return listThemePacks(
    path.join(sourcePlatformRoot(), "presets"),
    path.join(stateRoot(), "themes"),
  );
}

async function pickThemeImage() {
  if (!installationComplete()) throw new Error("Install the runtime before importing a theme.");
  const result = await dialog.showOpenDialog({
    title: "选择 Codex 主题背景",
    properties: ["openFile"],
    filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "heic", "tif", "tiff"] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const imagePath = fs.realpathSync(result.filePaths[0]);
  approvedImagePaths.clear();
  approvedImagePaths.add(imagePath);
  return {
    canceled: false,
    imagePath,
    imageUrl: pathToFileURL(imagePath).href,
    suggestedName: path.basename(imagePath, path.extname(imagePath)),
  };
}

async function createImageTheme(imagePath, options) {
  if (!installationComplete()) throw new Error("Install the runtime before importing a theme.");
  const resolvedImagePath = fs.realpathSync(String(imagePath || ""));
  if (!approvedImagePaths.has(resolvedImagePath)) throw new Error("Choose the image again before creating the theme.");
  const normalized = normalizeThemeOptions(options);
  try {
    if (isMac) {
      const args = ["--file", resolvedImagePath, "--appearance", normalized.appearance, "--safe-area", normalized.safeArea, "--task-mode", normalized.taskMode, "--focus-x", String(normalized.focusX), "--focus-y", String(normalized.focusY)];
      if (normalized.name) args.push("--name", normalized.name);
      if (normalized.group) args.push("--group", normalized.group);
      await runPlatformScript("load-image-theme-macos.sh", args);
    } else {
      const args = ["-Action", "ApplyImage", "-ImagePath", resolvedImagePath, "-Appearance", normalized.appearance, "-SafeArea", normalized.safeArea, "-TaskMode", normalized.taskMode, "-FocusX", String(normalized.focusX), "-FocusY", String(normalized.focusY)];
      if (normalized.name) args.push("-Name", normalized.name);
      if (normalized.group) args.push("-Group", normalized.group);
      await runPlatformScript("desktop-actions.ps1", args);
      await runPlatformScript("start-dream-skin.ps1", ["-PromptRestart"]);
    }
  } catch (error) {
    if (isMac) {
      const logPath = path.join(stateRoot(), "injector-error.log");
      try {
        const tail = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).slice(-8).join("\n");
        if (tail) error.stderr = `${String(error.stderr || "").trim()}\n${tail}`.trim();
      } catch {}
    }
    throw error;
  }
  approvedImagePaths.delete(resolvedImagePath);
  return { created: true, imagePath: resolvedImagePath };
}

function readJsonFile(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return null; }
}

async function getDiagnostics() {
  const preflight = await getPreflight();
  const status = await getStatus(true);
  const sessionState = readJsonFile(statePath()) || {};
  const theme = readJsonFile(path.join(activeThemeRoot(), "theme.json"));
  const imageName = theme && path.basename(String(theme.image || ""));
  const imagePath = imageName ? path.join(activeThemeRoot(), imageName) : "";
  const installed = installationComplete();
  const activeSession = isMac
    ? status.session === "active" && status.injectorAlive === true && status.cdpOk === true
    : ["active", "applying", "paused"].includes(status.session) || Boolean(status.running);
  const checks = [
    {
      id: "codex",
      title: "Codex 应用",
      status: preflight.codexInstalled ? "ok" : "error",
      value: preflight.codexInstalled ? (preflight.codexVersion ? `版本 ${preflight.codexVersion}` : "已检测到") : "未检测到",
      detail: preflight.codexInstalled ? "官方桌面端可用。" : "请先安装并启动一次官方 Codex 桌面端。",
    },
    {
      id: "config",
      title: "Codex 配置",
      status: fs.existsSync(codexConfigPath()) ? "ok" : "error",
      value: codexConfigPath(),
      detail: fs.existsSync(codexConfigPath()) ? "config.toml 可读取。" : "请先启动一次 Codex，让它生成 config.toml。",
    },
    {
      id: "cdp",
      title: "CDP 会话",
      status: activeSession ? "ok" : installed ? "warning" : "pending",
      value: status.port ? `本机安全回环 127.0.0.1:${status.port}` : `${isMac ? 9341 : 9335}（平台默认）`,
      detail: activeSession ? "CDP 仅监听本机 127.0.0.1，会话已验证。" : installed ? "127.0.0.1 是正常的本机地址；当前端口尚未建立或未通过验证。" : "安装运行时后检测实际端口。",
    },
    {
      id: "node",
      title: "Node 运行时",
      status: isMac ? (sessionState.nodePath && fs.existsSync(sessionState.nodePath) ? "ok" : installed ? "warning" : "pending") : (preflight.nodeReady ? "ok" : "error"),
      value: isMac ? "Codex 内置签名 Node.js" : "Node.js 22+",
      detail: isMac
        ? (sessionState.nodePath ? "已从运行状态验证签名运行时路径。" : "应用一次主题后验证实际运行时路径。")
        : (preflight.nodeReady ? "Windows Node.js 版本符合要求。" : "请安装 Node.js 22 或更高版本。"),
    },
    {
      id: "theme",
      title: "主题资源",
      status: theme && imagePath && fs.existsSync(imagePath) ? "ok" : installed ? "warning" : "pending",
      value: theme ? `theme.json · ${imageName || "未引用背景图"}` : "未检测到活动主题",
      detail: theme && imagePath && fs.existsSync(imagePath) ? "主题配置及其引用背景图完整。" : "选择并应用主题后重新检查。",
    },
  ];
  return { checkedAt: new Date().toISOString(), platform: isMac ? "macOS" : "Windows", checks };
}

async function openLogs() {
  const candidates = ["injector-error.log", "injector.log", "verify.log", "menubar-apply.log"]
    .map((name) => path.join(stateRoot(), name));
  const logPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!logPath) throw new Error("No runtime log exists yet. Run or diagnose the skin runtime first.");
  const error = await shell.openPath(logPath);
  if (error) throw new Error(error);
  return logPath;
}

async function installRuntime(ownerWindow) {
  const preflight = await getPreflight();
  if (!preflight.codexInstalled) {
    throw new Error(preflight.error?.detail || "The official Codex desktop app is not installed.");
  }
  if (isWindows && preflight.nodeReady === false) throw new Error("Node.js 22 or newer is required on Windows.");
  if (preflight.codexRunning) {
    const choice = await dialog.showMessageBox(ownerWindow, {
      type: "warning",
      title: "安装换肤运行时",
      message: "需要暂时关闭 Codex",
      detail: "安装会更新用户配置。为避免 Codex 同时保存配置，请先关闭它。未发送的输入可能会丢失。",
      buttons: ["取消", "关闭 Codex 并继续"],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    });
    if (choice.response === 0) return { canceled: true };
    if (isWindows) await runPlatformScript("desktop-actions.ps1", ["-Action", "StopCodexForInstall"], true);
    else await runPlatformScript("desktop-actions-macos.sh", ["--action", "stop-codex"], true);
  }
  const result = isMac
    ? await runPlatformScript("install-dream-skin-macos.sh", ["--no-launchers", "--no-launch"], true)
    : await runPlatformScript("install-dream-skin.ps1", ["-NoShortcuts"], true);
  if (!installationComplete()) throw new Error("Runtime installer completed without an installation marker.");
  return { canceled: false, stdout: result.stdout || "" };
}

async function performAction(action, value) {
  if (action === "install") return installRuntime(value);
  if (!installationComplete()) throw new Error("Install the runtime before using this action.");
  const actions = {
    start: () => isMac ? runPlatformScript("start-dream-skin-macos.sh", ["--prompt-restart"]) : runPlatformScript("start-dream-skin.ps1", ["-PromptRestart"]),
    restore: () => isMac ? runPlatformScript("restore-dream-skin-macos.sh", ["--restore-base-theme", "--restart-codex"]) : runPlatformScript("restore-dream-skin.ps1", ["-RestoreBaseTheme", "-PromptRestart"]),
    pause: async () => {
      const status = await getStatus();
      if (status.paused || status.session === "paused") {
        return isMac ? runPlatformScript("start-dream-skin-macos.sh", ["--prompt-restart"]) : runPlatformScript("start-dream-skin.ps1", ["-PromptRestart"]);
      }
      return isMac ? runPlatformScript("pause-dream-skin-macos.sh") : runPlatformScript("desktop-actions.ps1", ["-Action", "Pause"]);
    },
  };
  if (!actions[action]) throw new Error(`Unknown action: ${action}`);
  const result = await actions[action]();
  return { stdout: result?.stdout || "", stderr: result?.stderr || "" };
}

async function applyTheme(themeId, source) {
  if (!installationComplete()) throw new Error("Install the runtime before applying a theme.");
  const theme = listThemes().find((item) => item.id === themeId && item.source === source);
  if (!theme) throw new Error("Theme is no longer available. Refresh and try again.");
  if (isMac) return performThemeScript("switch-theme-macos.sh", ["--id", theme.id]);
  const action = theme.source === "custom" ? "ApplySaved" : "ApplyPreset";
  await runPlatformScript("desktop-actions.ps1", ["-Action", action, "-ThemeId", theme.id]);
  await runPlatformScript("start-dream-skin.ps1", ["-PromptRestart"]);
  return { applied: true };
}

async function deleteTheme(themeId, source, ownerWindow) {
  if (source !== "custom") throw new Error("Bundled themes cannot be deleted.");
  const theme = listThemes().find((item) => item.id === themeId && item.source === "custom");
  if (!theme) throw new Error("Theme is no longer available. Refresh and try again.");
  const themesRoot = path.resolve(path.join(stateRoot(), "themes"));
  const themeDirectory = path.resolve(themesRoot, theme.id);
  if (path.dirname(themeDirectory) !== themesRoot) throw new Error("Theme path is outside the managed theme directory.");
  const stat = fs.lstatSync(themeDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Theme directory is not safe to delete.");
  const choice = await dialog.showMessageBox(ownerWindow, {
    type: "warning",
    title: "删除主题",
    message: `确定删除“${theme.name}”吗？`,
    detail: "这会删除主题库中的背景图和 theme.json，操作无法撤销。当前已经显示的皮肤会保留到下次切换。",
    buttons: ["取消", "删除主题"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (choice.response !== 1) return { canceled: true };
  fs.rmSync(themeDirectory, { recursive: true, force: false });
  return { canceled: false, deleted: true, themeId: theme.id };
}

function managedThemeDirectory(themeId) {
  const themesRoot = path.resolve(path.join(stateRoot(), "themes"));
  const themeDirectory = path.resolve(themesRoot, String(themeId || ""));
  if (path.dirname(themeDirectory) !== themesRoot) throw new Error("Theme path is outside the managed theme directory.");
  const stat = fs.lstatSync(themeDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Theme directory is not safe to edit.");
  return themeDirectory;
}

async function updateThemeMetadata(themeId, source, metadata) {
  if (source !== "custom") throw new Error("Bundled themes cannot be edited.");
  const theme = listThemes().find((item) => item.id === themeId && item.source === "custom");
  if (!theme) throw new Error("Theme is no longer available. Refresh and try again.");
  const normalized = normalizeThemeMetadata(metadata);
  const themeDirectory = managedThemeDirectory(theme.id);
  const themePath = path.join(themeDirectory, "theme.json");
  const themeStat = fs.lstatSync(themePath);
  if (!themeStat.isFile() || themeStat.isSymbolicLink()) throw new Error("Theme metadata is not safe to edit.");
  const document = JSON.parse(fs.readFileSync(themePath, "utf8"));
  document.name = normalized.name;
  if (normalized.group) document.group = normalized.group;
  else delete document.group;
  const temporary = path.join(themeDirectory, `.theme-${process.pid}-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, themePath);
  } finally {
    try { fs.rmSync(temporary, { force: true }); } catch {}
  }
  return { updated: true, themeId: theme.id, name: normalized.name, group: normalized.group || "未分组" };
}

async function performThemeScript(script, args) {
  const result = await runPlatformScript(script, args);
  return { applied: true, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#11100f",
    title: "Codex Dream Skin",
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "preload.js") },
  });
  window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function handle(channel, operation) {
  ipcMain.handle(channel, async (event, ...args) => {
    try { return { ok: true, data: await operation(event, ...args) }; }
    catch (error) { return { ok: false, error: friendlyError(error) }; }
  });
}

handle("status", () => getStatus());
handle("themes", () => listThemes());
handle("app-info", () => ({ version: app.getVersion(), development: !app.isPackaged, platform: isMac ? "macOS" : "Windows" }));
handle("diagnostics", () => getDiagnostics());
handle("action", (event, action) => performAction(action, BrowserWindow.fromWebContents(event.sender)));
handle("apply-theme", (_event, themeId, source) => applyTheme(themeId, source));
handle("delete-theme", (event, themeId, source) => deleteTheme(themeId, source, BrowserWindow.fromWebContents(event.sender)));
handle("update-theme-metadata", (_event, themeId, source, metadata) => updateThemeMetadata(themeId, source, metadata));
handle("pick-theme-image", () => pickThemeImage());
handle("create-image-theme", (_event, imagePath, options) => createImageTheme(imagePath, options));
handle("open-state", async () => {
  if (!fs.existsSync(stateRoot())) throw new Error("Runtime state directory is created after installation.");
  const error = await shell.openPath(stateRoot());
  if (error) throw new Error(error);
  return stateRoot();
});
handle("open-logs", () => openLogs());

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on("window-all-closed", () => { if (!isMac) app.quit(); });
