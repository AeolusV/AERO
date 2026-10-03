const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const root = join(__dirname, "..");
const file = join(root, "scripts", "sign-portable.ps1");
const source = readFileSync(file, "utf8");
assert.ok(source.includes("if (-not $Execute)"));
assert.ok(source.indexOf("if ($blockers.Count)") < source.indexOf("Copy-Item"));
assert.ok(source.includes("verify /pa /all"));
assert.ok(source.includes('"/fd", "SHA256", "/tr", $TimestampUrl, "/td", "SHA256"'));
assert.ok(source.includes("TimeStamperCertificate"));
assert.ok(source.includes("Output exists; preserve it"));
assert.ok(source.includes("Checksum path escapes"));
assert.ok(!source.includes("/p ") && !source.includes("Export-PfxCertificate"));
if (process.platform === "win32") {
  const parser = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$tokens=$null; $issues=$null; [System.Management.Automation.Language.Parser]::ParseFile('" + file.replace(/'/g, "''") + "',[ref]$tokens,[ref]$issues) | Out-Null; if($issues.Count){ $issues | ForEach-Object { $_.Message }; exit 1 }"],
    { encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.equal(parser.status, 0, parser.stderr || parser.stdout);
}
console.log("signing: safe plan, guards, verification, timestamp and syntax checks passed");
