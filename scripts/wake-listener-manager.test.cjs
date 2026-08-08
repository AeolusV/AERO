const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { WakeListenerManager } = require("../electron/wake-listener-manager.cjs");

async function main() {
  const temporary = mkdtempSync(join(tmpdir(), "aero-wake-manager-"));
  const app = {
    getPath(name) {
      if (name === "userData") return temporary;
      if (name === "documents") return join(process.env.USERPROFILE || "C:\\Users\\Aeolus", "Documents");
      throw new Error(`Unexpected app path: ${name}`);
    },
  };
  const manager = new WakeListenerManager({
    app,
    scriptPath: join(__dirname, "..", "wake", "wake_listener.py"),
  });

  try {
    const initial = await manager.initialize();
    assert.equal(initial.status, "disabled");
    assert.equal(initial.config.wakePhrase, "Hey Codex");
    assert.ok(existsSync(initial.config.pythonPath), "verified prototype Python should be discovered");
    assert.ok(existsSync(initial.config.modelPath), "verified English model should be discovered");

    const devices = await manager.listDevices();
    const realtek = devices.find((device) => device.index === 4);
    assert.ok(realtek, "prototype Realtek input device #4 should be present on this machine");
    manager.saveConfig({ inputDevice: realtek });

    const checked = await manager.check();
    assert.equal(checked.device.id, realtek.id);

    const events = await manager.runOnce([
      "--config",
      manager.configPath,
      "--simulate-trigger",
      "--no-hotkey",
    ]);
    const names = events.map((event) => event.event);
    assert.ok(names.indexOf("microphone-released") < names.indexOf("triggered"));
    assert.ok(names.indexOf("triggered") < names.indexOf("hotkey-sent"));
    assert.equal(events.find((event) => event.event === "hotkey-sent").simulated, true);

    const activated = await manager.activateVoice({ noHotkey: true });
    assert.equal(activated.status, "handed-off");
    assert.match(activated.message, /Codex Voice/);
    console.log(`WAKE_MANAGER_TESTS_OK devices=${devices.length} selected=${realtek.name}`);
  } finally {
    manager.dispose();
    rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
