const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { join } = require("node:path");
const { readFileSync } = require("node:fs");
const { WakeListenerManager, defaultWakeConfig } = require("../electron/wake-listener-manager.cjs");

async function main() {
  const app = { getPath: () => __dirname };
  const defaults = defaultWakeConfig(app);
  assert.equal(defaults.pythonPath, "");
  assert.equal(defaults.modelPath, "");
  assert.equal(defaults.inputDevice, null);
  assert.equal(defaults.enabled, false);
  const launches = [];
  const manager = new WakeListenerManager({ app, scriptPath: __filename, spawnImpl: (_exe, args) => {
    const child = new EventEmitter();
    Object.assign(child, { pid: 123, killed: false, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill() { this.killed = true; } });
    launches.push({ child, args });
    return child;
  } });
  manager.log = () => {}; // Fixtures must never touch user logs or a microphone.
  manager.config = { ...defaults, pythonPath: process.execPath, modelPath: __dirname, inputDevice: 0 };
  manager.validateStartConfig(); // Device zero is a valid selection.
  await manager.start({ testWake: true });
  assert.ok(launches[0].args.includes("--test-wake"));
  assert.ok(launches[0].args.includes("--no-hotkey"));
  manager.parseLine(JSON.stringify({ event: "ready" }));
  assert.equal(manager.snapshot().status, "testing");
  await assert.rejects(manager.start({ testWake: true }), /先关闭监听/);
  await assert.rejects(manager.setEnabled(true), /结束唤醒测试/);
  assert.equal(launches.length, 1);
  manager.parseLine(JSON.stringify({ event: "test-complete", matched: true }));
  launches[0].child.emit("close", 0);
  assert.equal(manager.snapshot().status, "test-passed");
  assert.equal(manager.snapshot().pid, null);
  assert.equal(manager.config.enabled, false);
  await manager.start({ testWake: true });
  manager.parseLine(JSON.stringify({ event: "test-complete", matched: false }));
  launches[1].child.emit("close", 0);
  assert.equal(manager.snapshot().status, "test-timeout");
  await manager.start({ testWake: true });
  manager.stopRequested = true;
  manager.parseLine(JSON.stringify({ event: "test-complete", matched: false, cancelled: true }));
  launches[2].child.emit("close", 0);
  assert.equal(manager.snapshot().status, "disabled");
  const python = readFileSync(join(__dirname, "../wake/wake_listener.py"), "utf8");
  assert.ok(python.includes("deadline = time.monotonic() + 30"));
  assert.ok(python.indexOf('emit("test-complete"') < python.indexOf('emit("triggered", wakePhrase=phrase_text)'));
  const preload = readFileSync(join(__dirname, "../electron/preload.cjs"), "utf8");
  assert.ok(preload.includes('testWake: () => ipcRenderer.invoke("aero-wake:test")'));
  const installer = readFileSync(join(__dirname, "../wake/install_runtime.ps1"), "utf8");
  assert.ok(installer.includes('"--no-bin", "--no-registry"'));
  console.log("wake-onboarding: clean defaults, device zero, no-hotkey tests, single instance, results and cancellation passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
