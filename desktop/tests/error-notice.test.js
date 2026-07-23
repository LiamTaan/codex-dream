const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rendererRoot = path.join(__dirname, "..", "renderer");
const appSource = fs.readFileSync(path.join(rendererRoot, "app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(rendererRoot, "index.html"), "utf8");

test("persistent error notice can be dismissed and expires automatically", () => {
  assert.match(htmlSource, /id="notice-close"[^>]*aria-label="关闭错误提示"/);
  assert.match(appSource, /function dismissError\(\)/);
  assert.match(appSource, /noticeTimer = setTimeout\(dismissError, 12000\)/);
  assert.match(appSource, /#notice-close"\)\.addEventListener\("click", dismissError\)/);
  assert.match(appSource, /#error-dialog"\)\.addEventListener\("close", dismissError\)/);
});

test("a successful toast clears an obsolete error notice", () => {
  assert.match(appSource, /function showToast\(message\) \{\s*dismissError\(\)/);
});
