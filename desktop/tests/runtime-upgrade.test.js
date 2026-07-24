const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const desktopRoot = path.join(__dirname, "..");
const repositoryRoot = path.join(desktopRoot, "..");
const mainSource = fs.readFileSync(path.join(desktopRoot, "main.js"), "utf8");
const rendererSource = fs.readFileSync(path.join(desktopRoot, "renderer", "app.js"), "utf8");

test("desktop diagnostics read the active theme from each platform's managed location", () => {
  assert.match(mainSource, /isWindows \? "active-theme" : "theme"/);
});

test("Windows theme switches keep an active watcher alive and verify the new payload", () => {
  assert.match(mainSource, /desktop-actions\.ps1", \["-Action", "ApplyLive"\]/);
  assert.match(mainSource, /if \(live\.applied\) return/);
  assert.match(mainSource, /if \(live\.available\) throw new Error/);
  assert.match(mainSource, /await runPlatformScript\("start-dream-skin\.ps1", \["-PromptRestart"\]\)/);
  const actionsSource = fs.readFileSync(path.join(repositoryRoot, "windows", "scripts", "desktop-actions.ps1"), "utf8");
  const themeSource = fs.readFileSync(path.join(repositoryRoot, "windows", "scripts", "theme-windows.ps1"), "utf8");
  assert.match(actionsSource, /'ApplyLive'/);
  assert.match(themeSource, /function Invoke-DreamSkinLiveApply/);
  assert.match(themeSource, /'--once'/);
  assert.match(themeSource, /function Test-DreamSkinLiveWatcher/);
});

test("packaged app requires managed runtime version parity", () => {
  assert.match(mainSource, /function installedRuntimeVersion\(\)/);
  assert.match(mainSource, /requiredVersion === "unknown" \|\| requiredVersion === currentVersion/);
  assert.match(mainSource, /const upgradeRequired = partial && requiredVersion !== "unknown" && currentVersion !== requiredVersion/);
  assert.match(rendererSource, /检测到旧运行时/);
  assert.match(rendererSource, /更新运行时/);
});

test("both platform runtimes expose the same upgrade version", () => {
  const macVersion = fs.readFileSync(path.join(repositoryRoot, "macos", "VERSION"), "utf8").trim();
  const windowsVersion = fs.readFileSync(path.join(repositoryRoot, "windows", "VERSION"), "utf8").trim();
  assert.equal(macVersion, "1.2.1");
  assert.equal(windowsVersion, macVersion);
});
