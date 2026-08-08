const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { WakeRuntimeInstaller } = require("../electron/wake-runtime-installer.cjs");

const temporary = mkdtempSync(join(tmpdir(), "aero-wake-runtime-plan-"));

try {
  const scriptPath = join(__dirname, "..", "wake", "install_runtime.ps1");
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-RuntimeRoot",
    temporary,
    "-Plan",
  ], { encoding: "utf8", windowsHide: true });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const plan = result.stdout.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).at(-1);
  assert.equal(plan.event, "plan");
  assert.match(plan.uvUrl, /^https:\/\/github\.com\/astral-sh\/uv\/releases\/download\//);
  assert.equal(plan.pythonVersion, "3.12.10");
  assert.deepEqual(plan.packages, ["vosk==0.3.45", "sounddevice==0.5.5"]);
  assert.equal(plan.modelSha256, "30F26242C4EB449F948E42CB302DD7A686CB29A3423A8367F99FF41780942498");

  const fakeApp = { getPath: (name) => {
    if (name === "userData") return temporary;
    throw new Error(`Unexpected app path: ${name}`);
  } };
  const installer = new WakeRuntimeInstaller({ app: fakeApp, scriptPath });
  assert.equal(installer.snapshot().status, "idle");
  assert.equal(installer.snapshot().runtimeRoot, join(temporary, "wake-runtime"));
  console.log(`WAKE_RUNTIME_PLAN_OK arch=${plan.architecture} model=${plan.modelUrl}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
