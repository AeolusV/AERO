const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { runtimeFiles, packagePortable } = require("./package-portable.cjs");
const root = join(__dirname, "..");
assert.throws(() => packagePortable({ root, out: root, platform: "linux" }), /Windows x64/);
assert.throws(() => packagePortable({ root, out: root, platform: "win32", arch: "arm64" }), /Windows x64/);
assert.equal(new Set(runtimeFiles).size, runtimeFiles.length);
for (const file of runtimeFiles) assert.ok(existsSync(join(root, file)), file);
for (const file of ["wake/wake_listener.py", "wake/install_runtime.ps1", "wake/runtime-sources.json", "electron/package-smoke.cjs", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  assert.ok(runtimeFiles.includes(file), file);
}
const main = readFileSync(join(root, "electron/main.cjs"), "utf8");
assert.ok(main.indexOf('if (packageSmoke) {\n    return') < main.indexOf("bridge = new CodexBridge"));
assert.ok(main.includes('app.setPath("userData", process.env.AERO_SMOKE_PROFILE)'));
console.log("packaging: platform guards, resource allowlist and isolated smoke wiring passed");
