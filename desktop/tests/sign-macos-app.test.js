const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { signMacApp, APP_IDENTIFIER } = require("../scripts/sign-macos-app.cjs");

function macContext() {
  return {
    electronPlatformName: "darwin",
    appOutDir: "/tmp/output path/mac-arm64",
    packager: { appInfo: { productFilename: "Codex Dream Skin" } },
  };
}

test("non-macOS builds do not invoke codesign", async () => {
  let called = false;
  await signMacApp({ electronPlatformName: "win32" }, {
    execFileSync() { called = true; },
  });
  assert.equal(called, false);
});

test("macOS app is ad-hoc signed and strictly verified", async () => {
  const calls = [];
  await signMacApp(macContext(), {
    execFileSync(command, args, options) { calls.push({ command, args, options }); },
  });

  const appPath = path.join("/tmp/output path/mac-arm64", "Codex Dream Skin.app");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, [
    "--force", "--deep", "--sign", "-", "--identifier", APP_IDENTIFIER, appPath,
  ]);
  assert.deepEqual(calls[1].args, [
    "--verify", "--deep", "--strict", "--verbose=4", appPath,
  ]);
  assert.equal(calls[0].command, "/usr/bin/codesign");
  assert.deepEqual(calls[0].options, { stdio: "inherit" });
});

test("codesign failures stop packaging", async () => {
  await assert.rejects(
    signMacApp(macContext(), {
      execFileSync() { throw new Error("codesign failed"); },
    }),
    /codesign failed/,
  );
});
