const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const optionValues = {
  appearance: new Set(["auto", "light", "dark"]),
  safeArea: new Set(["auto", "left", "right", "center", "none"]),
  taskMode: new Set(["auto", "ambient", "banner", "off"]),
};

function normalizeThemeOptions(value = {}) {
  const name = String(value.name || "").trim().slice(0, 80);
  const group = normalizeThemeGroup(value.group);
  const options = { name, group, focusX: normalizeFocus(value.focusX, "focusX"), focusY: normalizeFocus(value.focusY, "focusY") };
  for (const [key, allowed] of Object.entries(optionValues)) {
    const candidate = String(value[key] || "auto");
    if (!allowed.has(candidate)) throw new Error(`Invalid theme option: ${key}`);
    options[key] = candidate;
  }
  return options;
}

function normalizeThemeGroup(value) {
  const group = String(value || "").trim();
  if (/\p{Cc}|\u2028|\u2029/u.test(group)) throw new Error("Invalid theme option: group");
  return Array.from(group).slice(0, 40).join("");
}

function normalizeThemeMetadata(value = {}) {
  const name = String(value.name || "").trim();
  if (!name || Array.from(name).length > 80 || /\p{Cc}|\u2028|\u2029/u.test(name)) {
    throw new Error("Theme name must be between 1 and 80 visible characters.");
  }
  return { name: Array.from(name).slice(0, 80).join(""), group: normalizeThemeGroup(value.group) };
}

function normalizeFocus(value, key) {
  const candidate = value === undefined || value === null || value === "" ? 0.5 : Number(value);
  if (!Number.isFinite(candidate) || candidate < 0 || candidate > 1) throw new Error(`Invalid theme option: ${key}`);
  return Math.round(candidate * 1000) / 1000;
}

function readThemePack(directory, source) {
  try {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
    const themePath = path.join(directory, "theme.json");
    const theme = JSON.parse(fs.readFileSync(themePath, "utf8"));
    const rawImageName = String(theme.image || "background.jpg");
    const imageName = path.basename(rawImageName);
    if (!imageName || imageName !== rawImageName || /[\\/]/.test(rawImageName)) return null;
    const imagePath = path.join(directory, imageName);
    return {
      id: path.basename(directory),
      name: String(theme.name || path.basename(directory)),
      category: source === "custom" ? "我的主题" : "内置主题",
      group: source === "custom" ? String(theme.group || "").trim() || "未分组" : String(theme.group || "").trim() || "内置主题",
      runtimeId: String(theme.id || path.basename(directory)),
      source,
      appearance: String(theme.appearance || "auto"),
      description: String(theme.tagline || theme.description || "本地 Codex 桌面主题"),
      safeArea: String(theme.art?.safeArea || "auto"),
      taskMode: String(theme.art?.taskMode || "auto"),
      image: fs.existsSync(imagePath) ? pathToFileURL(imagePath).href : null,
    };
  } catch {
    return null;
  }
}

function readThemeRoot(root, source, filter = () => true) {
  if (!root || !fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && filter(entry.name))
    .map((entry) => readThemePack(path.join(root, entry.name), source))
    .filter(Boolean);
}

function listThemePacks(presetRoot, savedRoot) {
  const presets = readThemeRoot(presetRoot, "preset");
  const custom = readThemeRoot(savedRoot, "custom", (id) => !id.startsWith("preset-"));
  return [...presets, ...custom];
}

function commandDetail(error) {
  return [error?.stderr, error?.stdout, error?.message]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 12000);
}

function friendlyError(error) {
  const detail = commandDetail(error);
  const rules = [
    [/Close (?:Codex|ChatGPT) before installing/i, "CODEX_RUNNING", "需要关闭 Codex", "安装期间需要暂时关闭 Codex，避免它同时写入配置。请关闭后重试。"],
    [/Codex config not found/i, "CONFIG_MISSING", "尚未生成 Codex 配置", "请先正常启动一次 Codex，等待首页出现后退出，再重新安装运行时。"],
    [/official .* package is not installed|could not locate.*Codex|Codex app.*not found/i, "CODEX_MISSING", "未找到 Codex 桌面端", "请先安装并启动一次官方 Codex 桌面应用。"],
    [/Node\.js 22|Node.*runtime/i, "NODE_MISSING", "缺少 Node.js 运行时", "Windows 需要安装 Node.js 22 或更高版本，然后重新检查。"],
    [/Theme image metadata is invalid|16384px \/ 50MP safety limit|Could not convert image/i, "IMAGE_INVALID", "图片无法作为主题使用", "图片格式或元数据不受支持。请使用正常导出的 PNG、JPEG 或 WebP 图片后重试。"],
    [/tray before reinstalling/i, "TRAY_RUNNING", "请先退出托盘程序", "Codex Dream Skin 托盘程序仍在运行。请从系统托盘退出后重试。"],
    [/Runtime state directory is created after installation/i, "STATE_MISSING", "运行目录尚未创建", "完成运行时安装后，这里会显示主题、日志和状态文件。"],
    [/Install the runtime before/i, "RUNTIME_MISSING", "请先安装运行时", "完成运行时安装后才能执行此操作。"],
    [/timed out|ETIMEDOUT/i, "OPERATION_TIMEOUT", "操作超时", "运行时操作超过 90 秒，已停止等待。请重新打开 Codex Dream Skin 后重试。"],
    [/cancelled|canceled/i, "CANCELLED", "操作已取消", "没有更改当前设置。"],
  ];
  for (const [pattern, code, title, message] of rules) {
    if (pattern.test(detail)) return { code, title, message, detail };
  }
  const output = [error?.stderr, error?.stdout]
    .flatMap((value) => String(value || "").split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  const messageLine = String(error?.message || "").split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^Command failed:/i.test(line))
    .at(-1);
  const summary = output || messageLine || "操作未完成。";
  return { code: "COMMAND_FAILED", title: "操作未完成", message: summary.replace(/^.*Dream Skin:\s*/i, ""), detail };
}

module.exports = { friendlyError, listThemePacks, normalizeThemeMetadata, normalizeThemeOptions };
