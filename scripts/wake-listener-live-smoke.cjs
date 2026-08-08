const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { WakeListenerManager } = require("../electron/wake-listener-manager.cjs");

function waitForStatus(manager, wanted, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      manager.removeListener("state", onState);
      reject(new Error(`Timed out waiting for ${wanted.join(", ")}`));
    }, timeoutMs);
    const onState = (state) => {
      if (state.status === "error") {
        clearTimeout(timeout);
        manager.removeListener("state", onState);
        reject(new Error(state.message));
      } else if (wanted.includes(state.status)) {
        clearTimeout(timeout);
        manager.removeListener("state", onState);
        resolve(state);
      }
    };
    manager.on("state", onState);
  });
}

async function main() {
  const temporary = mkdtempSync(join(tmpdir(), "aero-wake-live-"));
  const app = {
    getPath(name) {
      if (name === "userData") return temporary;
      if (name === "documents") return join(process.env.USERPROFILE, "Documents");
      throw new Error(`Unexpected app path: ${name}`);
    },
  };
  const manager = new WakeListenerManager({
    app,
    scriptPath: join(__dirname, "..", "wake", "wake_listener.py"),
  });
  try {
    await manager.initialize();
    const devices = await manager.listDevices();
    const realtek = devices.find((device) => device.index === 4);
    assert.ok(realtek, "Realtek prototype device #4 is unavailable");
    manager.saveConfig({
      enabled: true,
      wakePhrase: "aero microphone smoke seven nine",
      inputDevice: realtek,
    });
    const listening = waitForStatus(manager, ["listening"]);
    await manager.start({ noHotkey: true });
    const ready = await listening;
    assert.equal(ready.device.id, realtek.id);
    await new Promise((resolve) => setTimeout(resolve, 900));
    await manager.stop();
    const stopped = manager.snapshot();
    assert.equal(stopped.status, "stopped");
    assert.equal(stopped.pid, null);
    console.log(`WAKE_LIVE_SMOKE_OK device=${realtek.name}`);
  } finally {
    manager.dispose();
    rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
