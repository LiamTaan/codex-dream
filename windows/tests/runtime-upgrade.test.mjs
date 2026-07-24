import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const common = fs.readFileSync(path.join(root, "scripts", "common-windows.ps1"), "utf8");

assert.match(common, /'VERSION'/, "Windows runtime installation must require a version marker.");
assert.match(
  common,
  /Copy-Item -LiteralPath \(Join-Path \$sourceRoot 'VERSION'\) -Destination \$stagingRoot/,
  "Windows runtime installation must copy its version marker into the managed engine.",
);
assert.equal(fs.readFileSync(path.join(root, "VERSION"), "utf8").trim(), "1.2.2");

console.log("PASS: Windows managed runtime carries an explicit upgrade version marker.");
