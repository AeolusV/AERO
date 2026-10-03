// AERO original portions: Copyright (c) 2026 Aeolus. See LICENSE.
// Renderer-only packaging check: no Codex process, microphone, hotkey or user settings.
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { resolveStartupTarget } = require("./startup.cjs");

async function runPackageSmoke({ app, BrowserWindow, nativeImage, root }) {
  let window;
  try {
    for (const file of ["preload.cjs", "wake-listener-manager.cjs", "wake-runtime-installer.cjs"]) {
      if (!existsSync(join(root, "electron", file))) throw new Error("Missing Electron resource: " + file);
    }
    for (const file of ["wake_listener.py", "install_runtime.ps1", "runtime-sources.json"]) {
      if (!existsSync(join(root, "wake", file))) throw new Error("Missing wake resource: " + file);
    }
    const icon = nativeImage.createFromPath(join(root, "public", "aero-tray.png"));
    if (icon.isEmpty()) throw new Error("Packaged tray asset is invalid.");
    const errors = [];
    window = new BrowserWindow({ show: false, width: 1440, height: 900,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.on("console-message", (details) => {
      if (details.level === "error") errors.push(details.message);
    });
    await window.loadFile(resolveStartupTarget({ root }).file);
    const result = await window.webContents.executeJavaScript(`new Promise(resolve => {
      const started = Date.now();
      const check = () => {
        const rail = document.querySelector('.floating-rail');
        if (rail) {
          document.querySelector('.settings-trigger').click();
          requestAnimationFrame(() => requestAnimationFrame(() => resolve({
            title: document.title, rail: true,
            settings: Boolean(document.querySelector('.customizer.is-open')),
            lamps: document.querySelectorAll('.edge-thread-light').length
          })));
        } else if (Date.now() - started > 8000) resolve({ rail: false });
        else setTimeout(check, 50);
      };
      check();
    })`);
    if (!result.rail || !result.settings || result.lamps !== 6 || errors.length) {
      throw new Error(JSON.stringify({ result, errors }));
    }
    console.log("PACKAGE_SMOKE_OK " + JSON.stringify(result));
    window.destroy();
    app.quit();
  } catch (error) {
    console.error("PACKAGE_SMOKE_FAILED " + error.message);
    window?.destroy();
    app.exit(1);
  }
}
module.exports = { runPackageSmoke };
