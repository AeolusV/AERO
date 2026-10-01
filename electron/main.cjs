// AERO original portions: Copyright (c) 2026 Aeolus. See LICENSE and THIRD_PARTY_NOTICES.md.
const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } = require("electron");
const { spawn } = require("node:child_process");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { CodexBridge } = require("./codex-bridge.cjs");
const { WakeListenerManager } = require("./wake-listener-manager.cjs");
const { WakeRuntimeInstaller } = require("./wake-runtime-installer.cjs");
const { resolveStartupTarget } = require("./startup.cjs");
const {
  advanceBoundsSpring,
  boundsAreNear,
  createBoundsSpringState,
  isBoundsSpringSettled,
  projectCompactPlacement,
  roundedBounds,
} = require("./window-spring.cjs");

const COLLAPSED_HEIGHT = 120;
const EXPANDED_HEIGHT = 680;
const WINDOW_WIDTH = 1240;
const COMPACT_WIDTH = 286;
const COMPACT_HEIGHT = 76;
const SNAP_THRESHOLD = 58;
const EDGE_BURST_DURATION = 2800;
const EDGE_BURST_LEAVE_DELAY = 620;
const BAR_MORPH_DURATION = 420;

let window;
let startupTarget;
let bridge;
let wakeManager;
let wakeRuntimeInstaller;
let tray;
let hiddenToTray = false;
let isQuitting = false;
let snappedEdge = null;
let compactMode = false;
let edgeDragging = false;
let edgeDragState = null;
let fullDragging = false;
let fullDragState = null;
let pointerInside = false;
let edgePointerInside = false;
let edgeBurstActive = false;
let expanded = false;
let moveTimer = null;
let hideTimer = null;
let burstTimer = null;
let internalMoveUntil = 0;
let boundsAnimationToken = 0;
let boundsSpring = null;
let reducedMotion = false;

const WINDOW_SPRINGS = {
  calm: { stiffness: 390, damping: 39 },
  snappy: { stiffness: 520, damping: 40 },
};

function openTerminalAt(cwd) {
  const terminal = spawn("powershell.exe", ["-NoExit"], {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  terminal.unref();
}
let previousBridgeState = null;
let edgeUpdate = { tone: "idle", slot: null, label: "Codex" };

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function placeWindow(height, width = WINDOW_WIDTH) {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const safeWidth = Math.min(width, area.width);
  return {
    x: Math.round(area.x + (area.width - safeWidth) / 2),
    y: area.y + 14,
    width: safeWidth,
    height,
  };
}

function displayForWindow() {
  return screen.getDisplayMatching(window?.getBounds() || placeWindow(COLLAPSED_HEIGHT));
}

function compactBoundsAround(reference = window?.getBounds() || placeWindow(COMPACT_HEIGHT, COMPACT_WIDTH)) {
  const area = screen.getDisplayMatching(reference).workArea;
  const width = Math.min(COMPACT_WIDTH, area.width);
  const height = Math.min(COMPACT_HEIGHT, area.height);
  return {
    x: Math.round(clamp(reference.x + (reference.width - width) / 2, area.x, area.x + area.width - width)),
    y: Math.round(clamp(reference.y + (reference.height - height) / 2, area.y, area.y + area.height - height)),
    width,
    height,
  };
}

function compactEdgeBounds(edge, reference = window?.getBounds() || placeWindow(COMPACT_HEIGHT, COMPACT_WIDTH)) {
  const area = screen.getDisplayMatching(reference).workArea;
  const bounds = compactBoundsAround(reference);
  if (edge === "left") bounds.x = area.x;
  if (edge === "right") bounds.x = area.x + area.width - bounds.width;
  if (edge === "top") bounds.y = area.y;
  if (edge === "bottom") bounds.y = area.y + area.height - bounds.height;
  return bounds;
}

function fullBoundsAround(reference = window?.getBounds() || placeWindow(COLLAPSED_HEIGHT), height = COLLAPSED_HEIGHT) {
  const area = screen.getDisplayMatching(reference).workArea;
  const width = Math.min(WINDOW_WIDTH, area.width);
  const safeHeight = Math.min(height, area.height);
  return {
    x: Math.round(clamp(reference.x + (reference.width - width) / 2, area.x, area.x + area.width - width)),
    y: Math.round(clamp(reference.y + (reference.height - safeHeight) / 2, area.y, area.y + area.height - safeHeight)),
    width,
    height: safeHeight,
  };
}

function setWindowBounds(bounds) {
  if (!window || window.isDestroyed()) return;
  boundsAnimationToken += 1;
  boundsSpring = null;
  internalMoveUntil = Date.now() + 320;
  window.setBounds(bounds, false);
}

function easeInOutMorph(progress) {
  const normalized = clamp(progress, 0, 1);
  return normalized < 0.5
    ? 4 * normalized ** 3
    : 1 - (-2 * normalized + 2) ** 3 / 2;
}

function interpolateBounds(from, target, progress) {
  return {
    x: Math.round(from.x + (target.x - from.x) * progress),
    y: Math.round(from.y + (target.y - from.y) * progress),
    width: Math.round(from.width + (target.width - from.width) * progress),
    height: Math.round(from.height + (target.height - from.height) * progress),
  };
}

function animateWindowBounds(bounds, { preset = "snappy", initialVelocity = {} } = {}) {
  if (!window || window.isDestroyed()) return;
  if (reducedMotion) {
    setWindowBounds(bounds);
    return;
  }

  const token = ++boundsAnimationToken;
  const from = window.getBounds();
  if (preset === "morph") {
    const startedAt = Date.now();
    let appliedBounds = from;
    // A compact/full handoff moves all four native window edges.  Keeping this
    // deterministic prevents Windows' integer-pixel bounds from re-settling
    // against a spring near the final frame.
    boundsSpring = { token, target: { ...bounds }, velocity: {} };
    internalMoveUntil = startedAt + BAR_MORPH_DURATION + 320;

    const tick = () => {
      if (token !== boundsAnimationToken || !window || window.isDestroyed()) return;
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(1, elapsed / BAR_MORPH_DURATION);
      const nextBounds = interpolateBounds(from, bounds, easeInOutMorph(progress));
      if (!boundsAreNear(nextBounds, appliedBounds, 0)) {
        window.setBounds(nextBounds, false);
        appliedBounds = nextBounds;
      }

      internalMoveUntil = Date.now() + 220;
      if (progress >= 1) {
        internalMoveUntil = Date.now() + 650;
        window.setBounds(bounds, false);
        if (boundsSpring?.token === token) boundsSpring = null;
        return;
      }
      setTimeout(tick, 16);
    };

    tick();
    return;
  }

  const carriedVelocity = boundsSpring?.velocity || {};
  const spring = WINDOW_SPRINGS[preset];
  let appliedBounds = from;
  boundsSpring = {
    token,
    ...createBoundsSpringState(from, bounds, initialVelocity, carriedVelocity),
  };
  let lastAt = Date.now();
  internalMoveUntil = lastAt + 1400;

  const tick = () => {
    if (token !== boundsAnimationToken || !window || window.isDestroyed()) return;
    const now = Date.now();
    const delta = (now - lastAt) / 1000;
    lastAt = now;
    advanceBoundsSpring(boundsSpring, bounds, spring, delta);
    const nextBounds = roundedBounds(boundsSpring);
    if (!boundsAreNear(nextBounds, appliedBounds, 0)) {
      window.setBounds(nextBounds, false);
      appliedBounds = nextBounds;
    }
    internalMoveUntil = Date.now() + 180;

    if (isBoundsSpringSettled(boundsSpring, bounds)) {
      internalMoveUntil = Date.now() + 650;
      window.setBounds(bounds, false);
      if (boundsSpring?.token === token) boundsSpring = null;
      return;
    }
    setTimeout(tick, 16);
  };

  tick();
}

function beginEdgeDrag(screenX, screenY) {
  if (!compactMode || !window || window.isDestroyed()) return;
  clearHideTimer();
  clearBurstTimer();
  boundsAnimationToken += 1;
  boundsSpring = null;
  edgePointerInside = true;
  edgeDragging = true;
  edgeDragState = {
    screenX,
    screenY,
    lastScreenX: screenX,
    lastScreenY: screenY,
    lastAt: Date.now(),
    bounds: window.getBounds(),
    velocityX: 0,
    velocityY: 0,
  };
  sendWindowMode();
}

function moveEdgeDrag(screenX, screenY) {
  if (!edgeDragState || !window || window.isDestroyed()) return;
  const drag = edgeDragState;
  const deltaX = screenX - drag.screenX;
  const deltaY = screenY - drag.screenY;
  const now = Date.now();
  const deltaTime = Math.max(0.001, (now - drag.lastAt) / 1000);
  const instantaneousX = (screenX - drag.lastScreenX) / deltaTime;
  const instantaneousY = (screenY - drag.lastScreenY) / deltaTime;
  drag.velocityX = drag.velocityX * 0.62 + instantaneousX * 0.38;
  drag.velocityY = drag.velocityY * 0.62 + instantaneousY * 0.38;
  drag.lastScreenX = screenX;
  drag.lastScreenY = screenY;
  drag.lastAt = now;
  const area = screen.getDisplayNearestPoint({ x: screenX, y: screenY }).workArea;
  const next = {
    ...drag.bounds,
    x: Math.round(clamp(drag.bounds.x + deltaX, area.x, area.x + area.width - drag.bounds.width)),
    y: Math.round(clamp(drag.bounds.y + deltaY, area.y, area.y + area.height - drag.bounds.height)),
  };

  internalMoveUntil = Date.now() + 420;
  window.setBounds(next, false);
}

function finishEdgeDrag(cancelled = false) {
  if (!edgeDragState || !window || window.isDestroyed()) return;
  const drag = edgeDragState;
  edgeDragState = null;
  edgeDragging = false;
  edgePointerInside = false;
  clearBurstTimer();
  const releaseVelocity = cancelled ? {} : { x: drag.velocityX, y: drag.velocityY };
  const current = cancelled ? drag.bounds : window.getBounds();
  const area = screen.getDisplayMatching(current).workArea;
  const placement = projectCompactPlacement(current, area, releaseVelocity, {
    snapThreshold: SNAP_THRESHOLD,
  });
  snappedEdge = placement.edge;
  edgeBurstActive = false;
  animateWindowBounds(placement.target, {
    preset: snappedEdge ? "snappy" : "calm",
    initialVelocity: releaseVelocity,
  });
  savePlacement(placement.target);
  sendWindowMode();
}

function beginFullDrag(screenX, screenY) {
  if (compactMode || !window || window.isDestroyed()) return;
  clearHideTimer();
  clearBurstTimer();
  boundsAnimationToken += 1;
  boundsSpring = null;
  fullDragging = true;
  fullDragState = {
    screenX,
    screenY,
    bounds: window.getBounds(),
    lastScreenX: screenX,
    lastScreenY: screenY,
    lastAt: Date.now(),
    velocityX: 0,
    velocityY: 0,
  };
  sendWindowMode();
}

function moveFullDrag(screenX, screenY) {
  if (!fullDragState || !window || window.isDestroyed()) return;
  const drag = fullDragState;
  const now = Date.now();
  const deltaTime = Math.max(0.001, (now - drag.lastAt) / 1000);
  const instantaneousX = (screenX - drag.lastScreenX) / deltaTime;
  const instantaneousY = (screenY - drag.lastScreenY) / deltaTime;
  drag.velocityX = drag.velocityX * 0.62 + instantaneousX * 0.38;
  drag.velocityY = drag.velocityY * 0.62 + instantaneousY * 0.38;
  drag.lastScreenX = screenX;
  drag.lastScreenY = screenY;
  drag.lastAt = now;
  const area = screen.getDisplayNearestPoint({ x: screenX, y: screenY }).workArea;
  window.setBounds({
    ...drag.bounds,
    x: Math.round(clamp(
      drag.bounds.x + screenX - drag.screenX,
      area.x,
      area.x + area.width - drag.bounds.width,
    )),
    y: Math.round(clamp(
      drag.bounds.y + screenY - drag.screenY,
      area.y,
      area.y + area.height - drag.bounds.height,
    )),
  }, false);
}

function finishFullDrag(cancelled = false) {
  if (!fullDragState || !window || window.isDestroyed()) return;
  const drag = fullDragState;
  fullDragState = null;
  fullDragging = false;
  const current = window.getBounds();
  const releaseVelocity = cancelled ? {} : { x: drag.velocityX, y: drag.velocityY };
  const area = screen.getDisplayMatching(current).workArea;
  const distances = [
    ["left", Math.abs(current.x - area.x)],
    ["right", Math.abs(current.x + current.width - (area.x + area.width))],
    ["top", Math.abs(current.y - area.y)],
    ["bottom", Math.abs(current.y + current.height - (area.y + area.height))],
  ].sort((left, right) => left[1] - right[1]);
  const edge = cancelled || distances[0][1] > SNAP_THRESHOLD ? null : distances[0][0];
  internalMoveUntil = Date.now() + 450;
  if (edge) {
    setCompactMode(true, { edge, initialVelocity: releaseVelocity });
    return;
  }
  snappedEdge = null;
  savePlacement(current);
  sendWindowMode();
}

function windowMode() {
  return {
    edge: snappedEdge,
    compact: compactMode,
    hidden: false,
    burst: edgeBurstActive,
    dragging: edgeDragging || fullDragging,
    ...edgeUpdate,
  };
}

function sendWindowMode() {
  if (!window || window.isDestroyed()) return;
  window.webContents.send("codex-bar:window-mode", windowMode());
}

function savePlacement(bounds = window?.getBounds()) {
  try {
    writeFileSync(join(app.getPath("userData"), "window-edge.json"), JSON.stringify({
      edge: snappedEdge,
      compact: compactMode,
      x: bounds?.x,
      y: bounds?.y,
    }), "utf8");
  } catch {
    // Window placement persistence is optional.
  }
}

function loadPlacement() {
  try {
    const path = join(app.getPath("userData"), "window-edge.json");
    if (!existsSync(path)) return { edge: null, compact: false, x: null, y: null };
    const value = JSON.parse(readFileSync(path, "utf8"));
    return {
      edge: ["left", "right", "top", "bottom"].includes(value?.edge) ? value.edge : null,
      compact: Boolean(value?.compact),
      x: Number.isFinite(value?.x) ? value.x : null,
      y: Number.isFinite(value?.y) ? value.y : null,
    };
  } catch {
    return { edge: null, compact: false, x: null, y: null };
  }
}

function clearHideTimer() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
}

function clearBurstTimer() {
  if (burstTimer) clearTimeout(burstTimer);
  burstTimer = null;
}

function clearEdgeBurst() {
  const hadBurst = edgeBurstActive;
  clearBurstTimer();
  edgeBurstActive = false;
  edgePointerInside = false;
  return hadBurst;
}

function endEdgeBurst() {
  clearBurstTimer();
  if (!edgeBurstActive || edgePointerInside || edgeDragging) return;
  edgeBurstActive = false;
  sendWindowMode();
}

function scheduleEdgeBurstCollapse(delay = EDGE_BURST_DURATION) {
  clearBurstTimer();
  if (!edgeBurstActive || edgePointerInside || edgeDragging) return;
  burstTimer = setTimeout(() => {
    burstTimer = null;
    endEdgeBurst();
  }, delay);
}

function logoImage() {
  const logoPaths = [
    join(__dirname, "..", "public", "aero-logo.svg"),
    join(__dirname, "..", "dist", "aero-logo.svg"),
  ];
  const logoPath = logoPaths.find((path) => existsSync(path));
  if (!logoPath) return nativeImage.createEmpty();
  const svg = readFileSync(logoPath, "utf8");
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function trayIcon() {
  const trayPaths = [
    join(__dirname, "..", "public", "aero-tray.png"),
    join(__dirname, "..", "dist", "aero-tray.png"),
  ];
  const trayPath = trayPaths.find((path) => existsSync(path));
  if (trayPath) {
    const image = nativeImage.createFromPath(trayPath);
    if (!image.isEmpty()) return image.resize({ width: 32, height: 32, quality: "best" });
  }
  return logoImage().resize({ width: 32, height: 32, quality: "best" });
}

async function activateVoiceFromTray() {
  if (!wakeManager) return;
  try {
    await wakeManager.activateVoice();
  } catch (error) {
    dialog.showErrorBox(
      "无法打开 Codex Voice",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const visible = Boolean(window && !window.isDestroyed() && window.isVisible() && !hiddenToTray);
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: visible ? "隐藏 Aero" : "显示 Aero",
      click: () => {
        if (visible) hideToTray();
        else showFromTray();
      },
    },
    {
      label: "打开 Codex Voice",
      enabled: Boolean(wakeManager),
      click: () => void activateVoiceFromTray(),
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
}

function createTray() {
  if (tray) return;
  tray = new Tray(trayIcon());
  tray.setToolTip("Aero · Codex Desktop companion");
  tray.on("click", () => {
    const visible = Boolean(window && !window.isDestroyed() && window.isVisible() && !hiddenToTray);
    if (visible) hideToTray();
    else showFromTray();
  });
  updateTrayMenu();
}

function hideToTray() {
  if (!window || window.isDestroyed()) return;
  hiddenToTray = true;
  pointerInside = false;
  clearHideTimer();
  clearEdgeBurst();
  window.hide();
  updateTrayMenu();
}

function setCompactMode(nextCompact, { edge = null, initialVelocity = {} } = {}) {
  if (!window || window.isDestroyed()) return windowMode();
  clearHideTimer();
  clearEdgeBurst();
  expanded = false;
  compactMode = Boolean(nextCompact);
  const current = window.getBounds();

  if (compactMode) {
    snappedEdge = edge;
    const target = snappedEdge
      ? compactEdgeBounds(snappedEdge, current)
      : compactBoundsAround(current);
    animateWindowBounds(target, { preset: "morph", initialVelocity });
    sendWindowMode();
    savePlacement(target);
    return windowMode();
  }

  snappedEdge = null;
  const target = fullBoundsAround(current, COLLAPSED_HEIGHT);
  animateWindowBounds(target, { preset: "morph", initialVelocity });
  sendWindowMode();
  savePlacement(target);
  return windowMode();
}

function showFromTray() {
  if (!app.isReady() || !startupTarget || isQuitting) return;
  hiddenToTray = false;
  if (!window || window.isDestroyed()) {
    createWindow();
    return;
  }
  if (!window.isVisible()) window.show();
  window.focus();
  updateTrayMenu();
}

function revealFromEdge() {
  if (compactMode) return setCompactMode(false);
  return windowMode();
}

function showEdgeUpdate(update) {
  edgeUpdate = update;
  if (hiddenToTray || edgeDragging || !compactMode || !window) {
    sendWindowMode();
    return;
  }
  edgeBurstActive = true;
  scheduleEdgeBurstCollapse();
  sendWindowMode();
}

function meaningfulUpdate(previous, next) {
  if (!previous) return null;
  if (next.pendingApproval && next.pendingApproval.requestId !== previous.pendingApproval?.requestId) {
    return { tone: "waiting", slot: null, label: "等待批准" };
  }
  for (let index = 0; index < Math.min(6, next.threads.length); index += 1) {
    const thread = next.threads[index];
    const oldThread = previous.threads.find((item) => item.id === thread.id);
    if (!oldThread) continue;
    const statusChanged = JSON.stringify(oldThread.status) !== JSON.stringify(thread.status);
    if (oldThread.tone !== thread.tone || statusChanged) {
      return { tone: thread.tone, slot: index + 1, label: thread.name };
    }
  }
  if (next.activeTurnId !== previous.activeTurnId) {
    const index = Math.max(0, next.threads.findIndex((item) => item.id === next.activeThreadId));
    return {
      tone: next.activeTurnId ? "active" : "complete",
      slot: index < 6 ? index + 1 : null,
      label: next.activeTurnId ? "任务开始" : "任务完成",
    };
  }
  if (next.connection !== previous.connection) {
    return {
      tone: next.connection === "connected" ? "complete" : next.connection === "error" ? "error" : "waiting",
      slot: null,
      label: next.connection === "connected" ? "已重新连接" : "连接变化",
    };
  }
  return null;
}

function settleSnap() {
  if (!window || window.isDestroyed() || edgeDragging || fullDragging || Date.now() < internalMoveUntil) return;
  const bounds = window.getBounds();
  const area = displayForWindow().workArea;
  const distances = [
    ["left", Math.abs(bounds.x - area.x)],
    ["right", Math.abs(bounds.x + bounds.width - (area.x + area.width))],
    ["top", Math.abs(bounds.y - area.y)],
    ["bottom", Math.abs(bounds.y + bounds.height - (area.y + area.height))],
  ].sort((a, b) => a[1] - b[1]);
  const nextEdge = distances[0][1] <= SNAP_THRESHOLD ? distances[0][0] : null;
  if (!compactMode) return;

  if (!nextEdge) {
    if (snappedEdge) {
      snappedEdge = null;
      savePlacement(bounds);
      sendWindowMode();
    }
    return;
  }
  snappedEdge = nextEdge;
  const target = compactEdgeBounds(nextEdge, bounds);
  animateWindowBounds(target, { preset: "snappy" });
  savePlacement(target);
  sendWindowMode();
}

function createWindow() {
  const placement = loadPlacement();
  compactMode = placement.compact;
  snappedEdge = compactMode ? placement.edge : null;
  const restoredCompact = {
    ...placeWindow(COMPACT_HEIGHT, COMPACT_WIDTH),
    ...(placement.x === null ? {} : { x: placement.x }),
    ...(placement.y === null ? {} : { y: placement.y }),
  };
  const initialBounds = compactMode
    ? (snappedEdge ? compactEdgeBounds(snappedEdge, restoredCompact) : compactBoundsAround(restoredCompact))
    : placeWindow(COLLAPSED_HEIGHT);
  internalMoveUntil = Date.now() + 1200;
  window = new BrowserWindow({
    ...initialBounds,
    icon: logoImage().resize({ width: 64, height: 64 }),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.setAlwaysOnTop(true, "floating");

  const loading = startupTarget.url
    ? window.loadURL(startupTarget.url)
    : window.loadFile(startupTarget.file);
  loading.catch((error) => {
    dialog.showErrorBox("AERO 无法加载界面", `请确认构建文件或本地开发服务可用。\n${error.message}`);
    app.quit();
  });

  window.once("ready-to-show", () => {
    window.showInactive();
    sendWindowMode();
  });
  window.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideToTray();
  });
  window.on("show", updateTrayMenu);
  window.on("hide", updateTrayMenu);
  window.on("move", () => {
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(settleSnap, 180);
  });
  window.on("closed", () => {
    window = null;
    updateTrayMenu();
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", showFromTray);
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  // Validate before creating background services: a failed launch must not leave a listener running.
  startupTarget = resolveStartupTarget({
    root: join(__dirname, ".."),
    dev: process.argv.includes("--dev"),
    devUrl: process.env.VITE_DEV_SERVER_URL || "",
  });
  bridge = new CodexBridge({
    openExternal: (url) => shell.openExternal(url),
    openPath: (path) => shell.openPath(path),
    openTerminal: openTerminalAt,
    writeClipboard: (text) => clipboard.writeText(text),
  });
  bridge.on("state", (state) => {
    window?.webContents.send("codex-bar:state", state);
    const update = meaningfulUpdate(previousBridgeState, state);
    previousBridgeState = state;
    if (update) showEdgeUpdate(update);
  });
  wakeManager = new WakeListenerManager({
    app,
    scriptPath: join(__dirname, "..", "wake", "wake_listener.py"),
  });
  wakeRuntimeInstaller = new WakeRuntimeInstaller({
    app,
    scriptPath: join(__dirname, "..", "wake", "install_runtime.ps1"),
  });
  wakeManager.on("state", (state) => {
    window?.webContents.send("aero-wake:state", state);
  });
  wakeRuntimeInstaller.on("state", (state) => {
    window?.webContents.send("aero-wake-runtime:state", state);
  });
  createTray();
  createWindow();
  bridge.connect().catch(() => undefined);
  wakeManager.initialize().catch(() => undefined);
}).catch((error) => {
  dialog.showErrorBox("AERO 启动失败", error.message);
  app.quit();
});

ipcMain.handle("codex-bar:get-state", () => bridge.snapshot());
ipcMain.handle("codex-bar:get-window-mode", () => windowMode());
ipcMain.handle("codex-bar:action", (_event, { action, payload }) => bridge.action(action, payload));
ipcMain.handle("codex-bar:set-reduced-motion", (_event, reduced) => {
  reducedMotion = Boolean(reduced);
  if (reducedMotion && boundsSpring && window && !window.isDestroyed()) {
    const target = boundsSpring.target;
    if (target) setWindowBounds(target);
  }
});
ipcMain.handle("codex-bar:pointer-presence", (_event, present) => {
  const nextPointerInside = Boolean(present);
  if (nextPointerInside === pointerInside) return;
  pointerInside = nextPointerInside;
});
ipcMain.handle("codex-bar:edge-pointer-presence", (_event, present) => {
  const nextEdgePointerInside = Boolean(present);
  if (nextEdgePointerInside === edgePointerInside) return;
  edgePointerInside = nextEdgePointerInside;
  if (!edgeBurstActive) return;
  if (edgePointerInside) clearBurstTimer();
  else scheduleEdgeBurstCollapse(EDGE_BURST_LEAVE_DELAY);
});
ipcMain.handle("codex-bar:reveal", () => revealFromEdge());
ipcMain.handle("codex-bar:set-compact", (_event, nextCompact) => (
  setCompactMode(Boolean(nextCompact))
));
ipcMain.on("codex-bar:edge-drag", (_event, payload) => {
  const phase = payload?.phase;
  const screenX = Number(payload?.screenX);
  const screenY = Number(payload?.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
  if (phase === "start") beginEdgeDrag(screenX, screenY);
  else if (phase === "move") moveEdgeDrag(screenX, screenY);
  else if (phase === "end") finishEdgeDrag(false);
  else if (phase === "cancel") finishEdgeDrag(true);
});
ipcMain.on("codex-bar:full-drag", (_event, payload) => {
  const phase = payload?.phase;
  const screenX = Number(payload?.screenX);
  const screenY = Number(payload?.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
  if (phase === "start") beginFullDrag(screenX, screenY);
  else if (phase === "move") moveFullDrag(screenX, screenY);
  else if (phase === "end") finishFullDrag(false);
  else if (phase === "cancel") finishFullDrag(true);
});
ipcMain.handle("codex-bar:set-expanded", (_event, nextExpanded) => {
  if (compactMode && nextExpanded) setCompactMode(false);
  expanded = Boolean(nextExpanded);
  if (expanded) {
    clearHideTimer();
  }
  const height = expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
  const bounds = fullBoundsAround(window.getBounds(), height);
  animateWindowBounds(bounds, {
    preset: expanded ? "snappy" : "calm",
  });
});
ipcMain.handle("codex-bar:close", () => hideToTray());
ipcMain.handle("aero-wake:get-state", () => wakeManager?.snapshot());
ipcMain.handle("aero-wake:save-config", (_event, patch) => wakeManager.saveConfig(patch || {}));
ipcMain.handle("aero-wake:set-enabled", (_event, enabled) => wakeManager.setEnabled(Boolean(enabled)));
ipcMain.handle("aero-wake:start", () => wakeManager.start());
ipcMain.handle("aero-wake:stop", () => wakeManager.stop());
ipcMain.handle("aero-wake:activate-voice", () => wakeManager.activateVoice());
ipcMain.handle("aero-wake:list-devices", () => wakeManager.listDevices());
ipcMain.handle("aero-wake:check", () => wakeManager.check());
ipcMain.handle("aero-wake:open-log", () => shell.openPath(wakeManager.snapshot().logPath));
ipcMain.handle("aero-wake:choose-python", async () => {
  const result = await dialog.showOpenDialog(window, {
    title: "选择本地 Python 运行环境",
    properties: ["openFile"],
    filters: [{ name: "Python", extensions: ["exe"] }],
  });
  return result.canceled ? null : result.filePaths[0] || null;
});
ipcMain.handle("aero-wake:choose-model", async () => {
  const result = await dialog.showOpenDialog(window, {
    title: "选择英文 Vosk 模型文件夹",
    properties: ["openDirectory"],
  });
  return result.canceled ? null : result.filePaths[0] || null;
});
ipcMain.handle("aero-wake-runtime:get-state", () => wakeRuntimeInstaller.snapshot());
ipcMain.handle("aero-wake-runtime:install", async () => {
  const runtime = await wakeRuntimeInstaller.install();
  const wake = wakeManager.saveConfig({
    pythonPath: runtime.pythonPath,
    modelPath: runtime.modelPath,
  });
  return { runtime, wake };
});

app.on("activate", showFromTray);
app.on("window-all-closed", () => {
  // Keep the background controller available through the Windows system tray.
});
app.on("before-quit", () => {
  isQuitting = true;
  clearHideTimer();
  clearEdgeBurst();
  wakeRuntimeInstaller?.dispose();
  wakeManager?.dispose();
  bridge?.dispose();
  tray?.destroy();
  tray = null;
});
