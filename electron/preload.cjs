const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codexBar", {
  getState: () => ipcRenderer.invoke("codex-bar:get-state"),
  getWindowMode: () => ipcRenderer.invoke("codex-bar:get-window-mode"),
  invoke: (action, payload = {}) => ipcRenderer.invoke("codex-bar:action", { action, payload }),
  setReducedMotion: (reduced) => ipcRenderer.invoke("codex-bar:set-reduced-motion", Boolean(reduced)),
  setPointerPresence: (present) => ipcRenderer.invoke("codex-bar:pointer-presence", Boolean(present)),
  setEdgePointerPresence: (present) => ipcRenderer.invoke("codex-bar:edge-pointer-presence", Boolean(present)),
  reveal: () => ipcRenderer.invoke("codex-bar:reveal"),
  edgeDrag: (phase, point) => ipcRenderer.send("codex-bar:edge-drag", {
    phase,
    screenX: Number(point?.screenX),
    screenY: Number(point?.screenY),
  }),
  fullDrag: (phase, point) => ipcRenderer.send("codex-bar:full-drag", {
    phase,
    screenX: Number(point?.screenX),
    screenY: Number(point?.screenY),
  }),
  setCompact: (compact) => ipcRenderer.invoke("codex-bar:set-compact", Boolean(compact)),
  setExpanded: (expanded) => ipcRenderer.invoke("codex-bar:set-expanded", Boolean(expanded)),
  close: () => ipcRenderer.invoke("codex-bar:close"),
  getWakeState: () => ipcRenderer.invoke("aero-wake:get-state"),
  saveWakeConfig: (patch) => ipcRenderer.invoke("aero-wake:save-config", patch),
  setWakeEnabled: (enabled) => ipcRenderer.invoke("aero-wake:set-enabled", Boolean(enabled)),
  startWake: () => ipcRenderer.invoke("aero-wake:start"),
    testWake: () => ipcRenderer.invoke("aero-wake:test"),
  stopWake: () => ipcRenderer.invoke("aero-wake:stop"),
  activateVoice: () => ipcRenderer.invoke("aero-wake:activate-voice"),
  listWakeDevices: () => ipcRenderer.invoke("aero-wake:list-devices"),
  checkWake: () => ipcRenderer.invoke("aero-wake:check"),
  openWakeLog: () => ipcRenderer.invoke("aero-wake:open-log"),
  chooseWakePython: () => ipcRenderer.invoke("aero-wake:choose-python"),
  chooseWakeModel: () => ipcRenderer.invoke("aero-wake:choose-model"),
  getWakeRuntimeState: () => ipcRenderer.invoke("aero-wake-runtime:get-state"),
  installWakeRuntime: () => ipcRenderer.invoke("aero-wake-runtime:install"),
  subscribe: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("codex-bar:state", handler);
    return () => ipcRenderer.removeListener("codex-bar:state", handler);
  },
  subscribeWindowMode: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("codex-bar:window-mode", handler);
    return () => ipcRenderer.removeListener("codex-bar:window-mode", handler);
  },
  subscribeWakeState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("aero-wake:state", handler);
    return () => ipcRenderer.removeListener("aero-wake:state", handler);
  },
  subscribeWakeRuntimeState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("aero-wake-runtime:state", handler);
    return () => ipcRenderer.removeListener("aero-wake-runtime:state", handler);
  },
});
