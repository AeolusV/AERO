// AERO original portions: Copyright (c) 2026 Aeolus. See LICENSE.
// Render the real production UI with fictional data; never connect to Codex.
const { app, BrowserWindow, ipcMain } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const root = join(__dirname, "..");
const temporary = process.env.AERO_DOCS_TEMP;
if (!temporary) throw new Error("Set AERO_DOCS_TEMP to a task-specific temporary directory");
app.setPath("userData", join(temporary, "electron-profile"));
app.disableHardwareAcceleration();
let mode = { edge: null, compact: false, hidden: false, burst: false, dragging: false, tone: "idle", slot: null, label: "Aero" };
const tones = ["active", "complete", "waiting", "idle", "error", "active"];
const names = ["设计首页", "整理组件", "确认方案", "等待下一步", "检查构建", "完善文档"];
const state = {
  connection: "connected", error: "", binaryPath: "codex.exe",
  threads: tones.map((tone, i) => ({ id: `demo-${i}`, name: names[i], preview: names[i], cwd: "C:\\Demo\\Aero", tone, updatedAt: Date.now() })),
  activeThreadId: "demo-0", activeTurnId: null,
  reasoningEffort: "high", reasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"], pendingApproval: null,
  remoteControl: { status: "disabled", serverName: "", installationId: "", environmentId: null, clients: [], pairing: null, error: "" },
};
const device = { id: "demo-mic", index: 0, name: "系统麦克风", hostApi: "WASAPI", channels: 1, defaultSampleRate: 48000 };
const wake = { status: "stopped", message: "等待启用本地监听", pid: null, device: null, lastEventAt: null,
  config: { version: 1, enabled: false, wakePhrase: "Hey Codex", pythonPath: "C:\\Aero\\runtime\\python.exe", modelPath: "C:\\Aero\\models\\vosk-model-small-en-us-0.15", inputDevice: device, sampleRate: 16000, hotkey: "Ctrl+Shift+V", diagnosticTranscripts: false } };
ipcMain.handle("codex-bar:get-state", () => state);
ipcMain.handle("codex-bar:get-window-mode", () => mode);
ipcMain.handle("codex-bar:action", () => state);
ipcMain.handle("codex-bar:set-compact", (_event, compact) => { mode = { ...mode, compact }; return mode; });
for (const name of ["set-expanded", "set-reduced-motion", "pointer-presence", "edge-pointer-presence", "reveal", "close"]) ipcMain.handle(`codex-bar:${name}`, () => undefined);
ipcMain.handle("aero-wake:get-state", () => wake);
ipcMain.handle("aero-wake:list-devices", () => [device]);
ipcMain.handle("aero-wake-runtime:get-state", () => ({ status: "idle", progress: 0, message: "可通过一键配置安装", runtimeRoot: "C:\\Aero\\runtime", pythonPath: "", modelPath: "" }));
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const output = join(root, "docs", "images");
app.whenReady().then(async () => {
  mkdirSync(output, { recursive: true });
  const window = new BrowserWindow({ width: 1240, height: 160, show: false, frame: false, transparent: true,
    webPreferences: { preload: join(root, "electron", "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true } });
  const errors = [];
  window.webContents.on("console-message", (_event, details) => { if (details.level >= 3) errors.push(details.message); });
  const render = async (file, width, height, compact) => {
    mode = { ...mode, compact };
    window.setSize(width, height);
    await window.loadFile(join(root, "dist", "index.html"));
    await delay(900);
    if (!await window.webContents.executeJavaScript("Boolean(document.querySelector('.floating-rail'))")) throw new Error("UI did not render");
    window.webContents.invalidate();
    await delay(150);
    writeFileSync(join(output, file), (await window.capturePage()).toPNG());
  };
  await render("aero-full.png", 1240, 160, false);
  await render("aero-mini.png", 360, 120, true);
  const lampCount = await window.webContents.executeJavaScript("document.querySelectorAll('.edge-thread-light').length");
  if (lampCount !== 6) throw new Error(`Expected six lamps, got ${lampCount}`);
  console.log(`Mini mode rendered, matching lamps: ${lampCount}`);
  await render("aero-settings.png", 1240, 700, false);
  await window.webContents.executeJavaScript("document.querySelector('.settings-trigger').click()");
  await delay(600);
  if (!await window.webContents.executeJavaScript("Boolean(document.querySelector('.customizer.is-open'))")) throw new Error("Settings did not open");
  writeFileSync(join(output, "aero-settings.png"), (await window.capturePage()).toPNG());
  await window.webContents.executeJavaScript("[...document.querySelectorAll('.settings-tabs button')].find(b=>b.textContent.includes('语音')).click()");
  await delay(600);
  if (!await window.webContents.executeJavaScript("Boolean(document.querySelector('.wake-panel'))")) throw new Error("Voice panel did not render");
  writeFileSync(join(output, "aero-voice.png"), (await window.capturePage()).toPNG());
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`README_RENDER_OK ${output}`);
  window.destroy();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
