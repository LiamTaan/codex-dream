const path = require("node:path");
const { execFileSync } = require("node:child_process");

const APP_IDENTIFIER = "com.liamtaan.codexdreamskin";

async function signMacApp(context, dependencies = {}) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const run = dependencies.execFileSync || execFileSync;
  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${productFilename}.app`);

  run("/usr/bin/codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    "--identifier",
    APP_IDENTIFIER,
    appPath,
  ], { stdio: "inherit" });

  run("/usr/bin/codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=4",
    appPath,
  ], { stdio: "inherit" });
}

module.exports = signMacApp;
module.exports.signMacApp = signMacApp;
module.exports.APP_IDENTIFIER = APP_IDENTIFIER;
