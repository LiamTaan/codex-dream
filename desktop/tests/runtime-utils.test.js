const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { friendlyError, listThemePacks, normalizeThemeMetadata, normalizeThemeOptions } = require("../runtime-utils");

test("installation errors become concise user-facing messages", () => {
  const result = friendlyError({
    message: "Command failed: /bin/bash install.sh",
    stderr: "ChatGPT Dream Skin: Close Codex before installing Dream Skin so config.toml cannot change.",
  });
  assert.equal(result.code, "CODEX_RUNNING");
  assert.equal(result.title, "需要关闭 Codex");
  assert.match(result.detail, /Close Codex/);
  assert.doesNotMatch(result.message, /\/bin\/bash/);
});

test("unknown command failures keep the command out of the summary", () => {
  const result = friendlyError({
    message: "Command failed: /bin/bash /private/path/action.sh\nUnexpected runtime response",
    stderr: "Unexpected runtime response",
  });
  assert.equal(result.message, "Unexpected runtime response");
  assert.doesNotMatch(result.message, /\/bin\/bash|private\/path/);
});

test("timed out Windows operations produce an actionable error", () => {
  const result = friendlyError({ message: "Command failed: powershell.exe\nOperation timed out" });
  assert.equal(result.code, "OPERATION_TIMEOUT");
  assert.equal(result.title, "操作超时");
  assert.match(result.message, /90 秒/);
});

test("theme options accept only supported values", () => {
  assert.deepEqual(normalizeThemeOptions({ name: "  My Skin  ", appearance: "dark", safeArea: "left", taskMode: "banner" }), {
    name: "My Skin",
    group: "",
    focusX: 0.5,
    focusY: 0.5,
    appearance: "dark",
    safeArea: "left",
    taskMode: "banner",
  });
  assert.throws(() => normalizeThemeOptions({ appearance: "sepia" }), /Invalid theme option/);
  assert.deepEqual(normalizeThemeOptions({ focusX: "0.125", focusY: 0.875 }).focusX, 0.125);
  assert.throws(() => normalizeThemeOptions({ focusX: 1.1 }), /Invalid theme option: focusX/);
  assert.deepEqual(normalizeThemeMetadata({ name: "  夜景  ", group: "  人像  " }), { name: "夜景", group: "人像" });
  assert.throws(() => normalizeThemeMetadata({ name: "" }), /Theme name/);
});

test("theme library separates bundled presets from managed custom themes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dream-skin-desktop-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const presets = path.join(root, "presets");
  const saved = path.join(root, "saved");
  const writeTheme = (directory, id, name) => {
    fs.mkdirSync(path.join(directory, id), { recursive: true });
    fs.writeFileSync(path.join(directory, id, "theme.json"), JSON.stringify({ id, name, image: "background.jpg" }));
    fs.writeFileSync(path.join(directory, id, "background.jpg"), "image");
  };
  writeTheme(presets, "preset-one", "Preset One");
  writeTheme(saved, "preset-one", "Seeded Duplicate");
  writeTheme(saved, "img-one", "My Theme");
  assert.deepEqual(listThemePacks(presets, saved).map(({ id, source }) => [id, source]), [
    ["preset-one", "preset"],
    ["img-one", "custom"],
  ]);
});

test("theme metadata exposes studio options without leaking file paths", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dream-skin-metadata-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "presets", "preset-one");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "theme.json"), JSON.stringify({
    name: "Preset One",
    tagline: "A focused local theme.",
    image: "background.jpg",
    group: "人物",
    art: { safeArea: "left", taskMode: "ambient" },
  }));
  fs.writeFileSync(path.join(directory, "background.jpg"), "image");
  const [theme] = listThemePacks(path.join(root, "presets"), path.join(root, "saved"));
  assert.equal(theme.description, "A focused local theme.");
  assert.equal(theme.safeArea, "left");
  assert.equal(theme.taskMode, "ambient");
  assert.equal(theme.group, "人物");
  assert.equal(theme.runtimeId, "preset-one");
  assert.equal("path" in theme, false);
});
