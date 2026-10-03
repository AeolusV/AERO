const { app, BrowserWindow, ipcMain } = require("electron");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

app.disableHardwareAcceleration();
if (process.env.AERO_WAKE_UI_PROFILE) app.setPath("userData", process.env.AERO_WAKE_UI_PROFILE);

const realtek = {
  id: "MME␟麦克风阵列 (Realtek(R) Audio)",
  index: 4,
  name: "麦克风阵列 (Realtek(R) Audio)",
  hostApi: "MME",
  channels: 2,
  defaultSampleRate: 44100,
};
const wakeState = {
  status: "stopped",
  message: "配置已就绪，等待启用本地监听",
  pid: null,
  device: null,
  lastEventAt: new Date().toISOString(),
  config: {
    version: 1,
    enabled: false,
    wakePhrase: "Hey Codex",
    pythonPath: "C:\\Aero\\wake-venv\\Scripts\\python.exe",
    modelPath: "C:\\Aero\\models\\vosk-model-small-en-us-0.15",
    inputDevice: realtek,
    sampleRate: 16000,
    hotkey: "Ctrl+Shift+V",
    diagnosticTranscripts: false,
  },
  logPath: "C:\\Aero\\logs\\wake-listener.log",
};
const runtimePreview = process.env.AERO_WAKE_UI_STATE || "idle";
const runtimeState = {
  status: runtimePreview === "installing" ? "downloading" : "idle",
  progress: runtimePreview === "installing" ? 64 : 0,
  message: runtimePreview === "installing" ? "正在下载官方英文 Vosk 模型" : "尚未配置 AERO 托管运行环境",
  pythonPath: "",
  modelPath: "",
  runtimeRoot: "C:\\Aero\\wake-runtime",
};
const bridgeState = {
  connection: "connected",
  error: "",
  binaryPath: "codex.exe",
  threads: [],
  activeThreadId: null,
  activeTurnId: null,
  reasoningEffort: "medium",
  pendingApproval: null,
  remoteControl: {
    status: "disabled",
    serverName: "",
    installationId: "",
    environmentId: null,
    clients: [],
    pairing: null,
    error: "",
  },
};

ipcMain.handle("codex-bar:get-state", () => bridgeState);
ipcMain.handle("codex-bar:get-window-mode", () => ({ edge: null, compact: false, hidden: false, burst: false, dragging: false, tone: "idle", slot: null, label: "Codex" }));
ipcMain.handle("codex-bar:action", () => bridgeState);
for (const channel of ["codex-bar:set-reduced-motion", "codex-bar:pointer-presence", "codex-bar:edge-pointer-presence", "codex-bar:reveal", "codex-bar:close"]) {
  ipcMain.handle(channel, () => undefined);
}
ipcMain.handle("codex-bar:set-compact", () => ({ edge: null, compact: false, hidden: false, burst: false, dragging: false, tone: "idle", slot: null, label: "Codex" }));
ipcMain.handle("codex-bar:set-expanded", (_event, expanded) => {
  const window = BrowserWindow.getAllWindows()[0];
  window?.setSize(1240, expanded ? 680 : 120);
});
ipcMain.handle("aero-wake:get-state", () => wakeState);
ipcMain.handle("aero-wake:save-config", () => wakeState);
ipcMain.handle("aero-wake:set-enabled", () => wakeState);
ipcMain.handle("aero-wake:start", () => wakeState);
ipcMain.handle("aero-wake:stop", () => wakeState);
ipcMain.handle("aero-wake:test", () => {
  wakeState.status = "test-passed";
  wakeState.message = "已识别唤醒词，麦克风已释放；未发送快捷键";
  BrowserWindow.getAllWindows()[0]?.webContents.send("aero-wake:state", wakeState);
  return wakeState;
});
ipcMain.handle("aero-wake:list-devices", () => [realtek]);
ipcMain.handle("aero-wake:check", () => ({ modelPath: wakeState.config.modelPath, deviceIndex: 4, device: realtek }));
ipcMain.handle("aero-wake:open-log", () => "");
ipcMain.handle("aero-wake:choose-python", () => null);
ipcMain.handle("aero-wake:choose-model", () => null);
ipcMain.handle("aero-wake-runtime:get-state", () => runtimeState);
ipcMain.handle("aero-wake-runtime:install", () => ({ runtime: runtimeState, wake: wakeState }));

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1240,
    height: 680,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: {
      preload: join(__dirname, "..", "electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const rendererErrors = [];
  window.webContents.on("console-message", event => { if (event.level === "error") rendererErrors.push(event.message); });
  await window.loadFile(join(__dirname, "..", "dist", "index.html"));
  const identity = await window.webContents.executeJavaScript("({title:document.title, url:location.href, overlay:Boolean(document.querySelector('vite-error-overlay'))})");
  if (!/Aero/i.test(identity.title) || !identity.url.startsWith("file:") || identity.overlay) throw new Error("Wrong page identity or error overlay");
  await window.webContents.executeJavaScript(`(() => {
    const style = document.createElement('style');
    style.textContent = '* { transition: none !important; animation: none !important; }';
    document.head.append(style);
  })()`);
  const clicked = await window.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('button.settings-trigger');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error("Settings trigger was not found");
  await new Promise((resolve) => setTimeout(resolve, 420));
  const panelMounted = await window.webContents.executeJavaScript("Boolean(document.querySelector('.customizer.is-open'))");
  if (!panelMounted) throw new Error("Settings panel did not open");
  const voiceClicked = await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('.settings-tabs button')]
      .find((candidate) => candidate.textContent?.includes('语音'));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!voiceClicked) throw new Error("Voice settings tab was not found");
  await new Promise((resolve) => setTimeout(resolve, 520));
  const wakePanelMounted = await window.webContents.executeJavaScript("Boolean(document.querySelector('.wake-panel'))");
  if (!wakePanelMounted) throw new Error("Wake settings panel did not mount");
  const installButtonMounted = await window.webContents.executeJavaScript("Boolean(document.querySelector('.wake-runtime-install'))");
  if (!installButtonMounted) throw new Error("One-click runtime install button did not mount");
  if (runtimePreview !== "installing") {
    const testClicked = await window.webContents.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('.wake-actions button')].find(item => item.textContent.includes('测试唤醒'));
      if (!button || button.disabled) return false;
      button.click(); return true;
    })()`);
    if (!testClicked) throw new Error("Wake test button was not usable");
    await new Promise(resolve => setTimeout(resolve, 250));
    const passed = await window.webContents.executeJavaScript("document.querySelector('.wake-status-pill')?.textContent === '测试通过'");
    if (!passed) throw new Error("Wake test result did not render");
  }
  const activeTab = await window.webContents.executeJavaScript("document.querySelector('.settings-tabs button.active')?.textContent?.trim() || ''");
  if (activeTab !== "语音") throw new Error(`Unexpected active settings tab: ${activeTab}`);
  const metrics = await window.webContents.executeJavaScript(`(() => {
    const panel = document.querySelector('.customizer');
    const wake = document.querySelector('.wake-panel');
    const style = getComputedStyle(panel);
    return {
      panelClass: panel.className,
      panelRect: panel.getBoundingClientRect().toJSON(),
      wakeRect: wake.getBoundingClientRect().toJSON(),
      opacity: style.opacity,
      visibility: style.visibility,
      background: style.background,
      viewport: [innerWidth, innerHeight],
    };
  })()`);
  console.log(`WAKE_UI_METRICS ${JSON.stringify(metrics)}`);
  window.showInactive();
  window.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 240));
  const image = await window.capturePage();
  const output = process.env.AERO_WAKE_UI_OUTPUT || join(__dirname, "..", "output", runtimePreview === "installing" ? "wake-settings-installing-smoke.png" : "wake-settings-smoke.png");
  writeFileSync(output, image.toPNG());
  if (rendererErrors.length) throw new Error(`Renderer errors: ${rendererErrors.join("; ")}`);
  console.log("WAKE_UI_CHECKS_OK identity=pass nonblank=pass overlay=pass console=pass interaction=pass screenshot=pass");
  console.log(`WAKE_UI_SMOKE_OK ${output}`);
  window.destroy();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
