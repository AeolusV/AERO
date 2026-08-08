const { app } = require("electron");
const { join } = require("node:path");
const { WakeListenerManager } = require("../electron/wake-listener-manager.cjs");

// This helper is a separate Electron entry point, so it must explicitly use
// the same profile directory as the packaged AERO application.
app.setPath("userData", join(app.getPath("appData"), "codex-micro-bar"));

function chooseInputDevice(devices, configured) {
  if (configured && typeof configured === "object") {
    const exact = devices.find((device) => device.id && device.id === configured.id);
    if (exact) return exact;

    const sameName = devices.find((device) => (
      device.name === configured.name
      && (!configured.hostApi || device.hostApi === configured.hostApi)
    ));
    if (sameName) return sameName;
  }

  if (Number.isInteger(configured)) {
    const legacyIndex = devices.find((device) => device.index === configured);
    if (legacyIndex) return legacyIndex;
  }

  return devices.find((device) => (
    /realtek/i.test(device.name)
    && /(microphone|麦克风)/i.test(device.name)
  )) || devices.find((device) => device.isDefaultInput) || null;
}

app.whenReady().then(async () => {
  const manager = new WakeListenerManager({
    app,
    scriptPath: join(__dirname, "..", "wake", "wake_listener.py"),
  });

  try {
    const devices = await manager.listDevices();
    const selected = chooseInputDevice(devices, manager.config.inputDevice);
    if (!selected) throw new Error("No usable microphone input device was found.");

    const state = manager.saveConfig({
      enabled: true,
      wakePhrase: "Hey Codex",
      inputDevice: selected,
    });

    process.stdout.write(`${JSON.stringify({
      event: "wake-config-enabled",
      configPath: manager.configPath,
      device: selected,
      modelPath: state.config.modelPath,
    })}\n`);
    app.quit();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    app.exit(1);
  }
});
