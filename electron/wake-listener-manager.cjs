const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} = require("node:fs");
const { basename, delimiter, dirname, isAbsolute, join } = require("node:path");
const { homedir } = require("node:os");

const CONFIG_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function commandExistsAsPath(command) {
  return !isAbsolute(command) || existsSync(command);
}

function normalizedDevice(value) {
  if (value == null) return null;
  if (Number.isInteger(value)) return value;
  if (typeof value !== "object") return null;
  return {
    id: typeof value.id === "string" ? value.id : "",
    index: Number.isInteger(value.index) ? value.index : null,
    name: typeof value.name === "string" ? value.name : "",
    hostApi: typeof value.hostApi === "string" ? value.hostApi : "",
  };
}

function mergeWakeConfig(base, patch = {}) {
  const next = { ...base, ...patch };
  return {
    version: CONFIG_VERSION,
    enabled: Boolean(next.enabled),
    wakePhrase: String(next.wakePhrase || "Hey Codex").trim() || "Hey Codex",
    pythonPath: String(next.pythonPath || "").trim(),
    modelPath: String(next.modelPath || "").trim(),
    inputDevice: normalizedDevice(next.inputDevice),
    sampleRate: Number.isFinite(Number(next.sampleRate)) ? Math.max(8000, Math.round(Number(next.sampleRate))) : 16000,
    hotkey: "Ctrl+Shift+V",
    diagnosticTranscripts: Boolean(next.diagnosticTranscripts),
  };
}

function legacyPrototypePaths(app) {
  // On Windows, Electron's `documents` path may be redirected to OneDrive even
  // when an existing prototype lives in the local user profile's Documents.
  // Probe both locations and accept only a complete Python + model pair.
  const documentRoots = [...new Set([
    app.getPath("documents"),
    join(process.env.USERPROFILE || homedir(), "Documents"),
    join(homedir(), "Documents"),
  ])];

  for (const documentsRoot of documentRoots) {
    const root = join(documentsRoot, "Codex", "2026-07-27", "realtime-voice-chat");
    const prototypeRoot = join(root, "outputs", "codex-local-wake");
    const pythonPath = join(root, "work", "codex-wake-venv", "Scripts", "python.exe");
    const modelPath = join(prototypeRoot, "models", "vosk-model-small-en-us-0.15");
    if (!existsSync(pythonPath) || !existsSync(modelPath)) continue;

    let inputDevice = null;
    try {
      const legacy = JSON.parse(readFileSync(join(prototypeRoot, "config.json"), "utf8"));
      if (Number.isInteger(legacy.input_device)) inputDevice = legacy.input_device;
    } catch {
      // Device selection remains available in AERO when legacy config is absent.
    }
    return { pythonPath, modelPath, inputDevice };
  }

  return { pythonPath: "", modelPath: "", inputDevice: null };
}

function defaultWakeConfig(app) {
  const legacy = legacyPrototypePaths(app);
  return mergeWakeConfig({
    version: CONFIG_VERSION,
    enabled: false,
    wakePhrase: "Hey Codex",
    pythonPath: legacy.pythonPath,
    modelPath: legacy.modelPath,
    inputDevice: legacy.inputDevice,
    sampleRate: 16000,
    hotkey: "Ctrl+Shift+V",
    diagnosticTranscripts: false,
  });
}

class WakeListenerManager extends EventEmitter {
  constructor({ app, scriptPath, spawnImpl = spawn }) {
    super();
    this.app = app;
    this.scriptPath = scriptPath;
    this.spawnImpl = spawnImpl;
    this.userDataPath = app.getPath("userData");
    this.configPath = join(this.userDataPath, "wake-listener.json");
    this.logPath = join(this.userDataPath, "logs", "wake-listener.log");
    this.config = defaultWakeConfig(app);
    this.child = null;
    this.stopRequested = false;
    this.triggered = false;
    this.state = {
      status: "disabled",
      message: "本地唤醒未启用",
      pid: null,
      device: null,
      lastEventAt: null,
      config: clone(this.config),
      logPath: this.logPath,
    };
  }

  initialize() {
    mkdirSync(dirname(this.logPath), { recursive: true });
    appendFileSync(this.logPath, "", "utf8");
    this.config = this.readConfig();
    this.updateState({
      status: this.config.enabled ? "stopped" : "disabled",
      message: this.config.enabled ? "等待启动本地监听" : "本地唤醒未启用",
      config: clone(this.config),
    });
    if (this.config.enabled) return this.start();
    return Promise.resolve(this.snapshot());
  }

  readConfig() {
    try {
      return mergeWakeConfig(defaultWakeConfig(this.app), JSON.parse(readFileSync(this.configPath, "utf8")));
    } catch {
      return defaultWakeConfig(this.app);
    }
  }

  writeConfig(config) {
    mkdirSync(dirname(this.configPath), { recursive: true });
    const temporary = `${this.configPath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    renameSync(temporary, this.configPath);
  }

  saveConfig(patch) {
    this.config = mergeWakeConfig(this.config, patch);
    this.writeConfig(this.config);
    this.updateState({ config: clone(this.config) });
    return this.snapshot();
  }

  snapshot() {
    return clone(this.state);
  }

  updateState(patch) {
    this.state = {
      ...this.state,
      ...patch,
      config: patch.config ? clone(patch.config) : this.state.config,
      lastEventAt: new Date().toISOString(),
    };
    this.emit("state", this.snapshot());
  }

  log(event, detail = "") {
    const safeDetail = String(detail).replace(/[\r\n]+/g, " ").slice(0, 1000);
    appendFileSync(this.logPath, `[${new Date().toISOString()}] ${event}${safeDetail ? ` ${safeDetail}` : ""}\n`, "utf8");
  }

  pythonCommand() {
    const configuredExecutable = this.config.pythonPath;
    if (!configuredExecutable) throw new Error("尚未配置 Python 运行环境");
    if (!commandExistsAsPath(configuredExecutable)) throw new Error(`Python 不存在：${configuredExecutable}`);

    const prefix = /^py(?:\.exe)?$/i.test(basename(configuredExecutable)) ? ["-3"] : [];
    const environment = { ...process.env, PYTHONUTF8: "1" };
    let executable = configuredExecutable;

    // A standard Windows venv uses a small redirector executable. When Node
    // launches that redirector from a Unicode workspace, some Python 3.12
    // builds fail before the interpreter starts. Resolve the venv's recorded
    // base interpreter and explicitly expose its site-packages instead.
    if (isAbsolute(configuredExecutable) && /^pythonw?\.exe$/i.test(basename(configuredExecutable))) {
      const venvRoot = dirname(dirname(configuredExecutable));
      const venvConfig = join(venvRoot, "pyvenv.cfg");
      if (existsSync(venvConfig)) {
        const content = readFileSync(venvConfig, "utf8");
        const executableLine = content.split(/\r?\n/).find((line) => /^executable\s*=/i.test(line));
        const recorded = executableLine?.slice(executableLine.indexOf("=") + 1).trim();
        const sitePackages = join(venvRoot, "Lib", "site-packages");
        if (recorded && existsSync(recorded) && existsSync(sitePackages)) {
          executable = recorded;
          environment.VIRTUAL_ENV = venvRoot;
          environment.PYTHONPATH = [sitePackages, environment.PYTHONPATH].filter(Boolean).join(delimiter);
          delete environment.PYTHONHOME;
        }
      }
    }
    return { executable, prefix, environment };
  }

  validateStartConfig() {
    this.pythonCommand();
    if (!existsSync(this.scriptPath)) throw new Error(`监听器脚本不存在：${this.scriptPath}`);
    if (!this.config.modelPath || !existsSync(this.config.modelPath)) {
      throw new Error("英文 Vosk 模型路径无效");
    }
    if (!this.config.inputDevice) throw new Error("尚未选择麦克风设备");
  }

  childArguments(extra = []) {
    const { prefix } = this.pythonCommand();
    // The verified Windows venv launcher can fail when its command line
    // contains the workspace's Chinese absolute path. The child already runs
    // in the sidecar directory, so an ASCII relative script name is safer.
    return [...prefix, "-u", basename(this.scriptPath), ...extra];
  }

  parseLine(line) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    switch (event.event) {
      case "starting":
        this.updateState({ status: "starting", message: `正在准备“${this.config.wakePhrase}”` });
        break;
      case "ready":
        this.log("listening", event.device?.name || "default-device");
        this.updateState({ status: "listening", message: `正在本地监听“${this.config.wakePhrase}”`, device: event.device || null });
        break;
      case "audio-status":
        this.log("audio-status", event.message || "");
        break;
      case "microphone-released":
        this.updateState({ status: event.reason === "triggered" ? "triggered" : "stopping", message: "麦克风已释放" });
        break;
      case "triggered":
        this.triggered = true;
        this.log("triggered", this.config.wakePhrase);
        this.updateState({ status: "triggered", message: "已唤醒，正在交接给 Codex Voice" });
        break;
      case "hotkey-sent":
        this.log("hotkey-sent", this.config.hotkey);
        this.updateState({ status: "handed-off", message: "已交接给 Codex Voice；监听器保持退出" });
        break;
      case "error":
        this.log("error", event.message || "unknown-sidecar-error");
        this.updateState({ status: "error", message: event.message || "监听器异常" });
        break;
      default:
        // Recognized text is deliberately neither persisted nor mirrored to UI.
        break;
    }
  }

  attachOutput(child) {
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() || "";
      lines.filter(Boolean).forEach((line) => this.parseLine(line));
    });
    child.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    return () => stderr.trim();
  }

  async start({ noHotkey = false } = {}) {
    if (this.child && !this.child.killed) return this.snapshot();
    try {
      this.validateStartConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log("start-rejected", message);
      this.updateState({ status: "error", message });
      throw error;
    }

    this.stopRequested = false;
    this.triggered = false;
    this.updateState({ status: "starting", message: "正在启动本地监听器", device: null });
    const { executable, environment } = this.pythonCommand();
    const child = this.spawnImpl(executable, this.childArguments([
      "--config",
      this.configPath,
      ...(noHotkey ? ["--no-hotkey"] : []),
    ]), {
      cwd: dirname(this.scriptPath),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: environment,
    });
    this.child = child;
    const stderr = this.attachOutput(child);
    this.updateState({ pid: child.pid || null });

    child.once("error", (error) => {
      if (this.child !== child) return;
      this.log("spawn-error", error.message);
      this.child = null;
      this.updateState({ status: "error", message: error.message, pid: null });
    });
    child.once("close", (code) => {
      if (this.child !== child) return;
      this.child = null;
      const detail = stderr();
      if (this.triggered) {
        this.updateState({ status: "handed-off", message: "Codex Voice 已唤醒；等待手动重新启用监听", pid: null, device: null });
      } else if (this.stopRequested) {
        this.updateState({
          status: this.config.enabled ? "stopped" : "disabled",
          message: this.config.enabled ? "监听器已停止" : "本地唤醒未启用",
          pid: null,
          device: null,
        });
      } else if (code === 0) {
        this.updateState({ status: "stopped", message: "监听器已退出", pid: null, device: null });
      } else {
        const message = detail || `监听器异常退出（${code ?? "unknown"}）`;
        this.log("unexpected-exit", message);
        this.updateState({ status: "error", message, pid: null, device: null });
      }
    });
    return this.snapshot();
  }

  stop() {
    const child = this.child;
    this.stopRequested = true;
    if (!child || child.killed) {
      this.updateState({
        status: this.config.enabled ? "stopped" : "disabled",
        message: this.config.enabled ? "监听器已停止" : "本地唤醒未启用",
        pid: null,
        device: null,
      });
      return Promise.resolve(this.snapshot());
    }
    this.updateState({ status: "stopping", message: "正在释放麦克风" });
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(this.snapshot());
      };
      child.once("close", finish);
      try {
        child.stdin?.write("stop\n");
      } catch {
        child.kill();
      }
      setTimeout(() => {
        if (this.child === child && !child.killed) child.kill();
        finish();
      }, 1800).unref();
    });
  }

  async setEnabled(enabled) {
    this.saveConfig({ enabled: Boolean(enabled) });
    if (enabled) return this.start();
    return this.stop();
  }

  async activateVoice({ noHotkey = false } = {}) {
    try {
      // A click must follow the same microphone handoff contract as a spoken
      // wake: stop the listener and wait for its audio stream to close first.
      if (this.child && !this.child.killed) await this.stop();
      this.writeConfig(this.config);
      this.updateState({
        status: "triggered",
        message: "正在打开 Codex Voice",
        pid: null,
        device: null,
      });

      const events = await this.runOnce([
        "--config",
        this.configPath,
        "--simulate-trigger",
        ...(noHotkey ? ["--no-hotkey"] : []),
      ], 10000);
      const hotkeyEvent = events.find((event) => event.event === "hotkey-sent");
      if (!hotkeyEvent) throw new Error("语音快捷键没有返回发送确认");

      this.log("hotkey-sent", `${this.config.hotkey}${noHotkey ? " simulated" : ""}`);
      this.updateState({
        status: "handed-off",
        message: "已打开 Codex Voice；监听器保持退出",
        pid: null,
        device: null,
      });
      return this.snapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log("voice-activation-error", message);
      this.updateState({ status: "error", message, pid: null, device: null });
      throw error;
    }
  }

  runOnce(extra, timeoutMs = 20000) {
    const { executable, environment } = this.pythonCommand();
    return new Promise((resolve, reject) => {
      const child = this.spawnImpl(executable, this.childArguments(extra), {
        cwd: dirname(this.scriptPath),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: environment,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => { stdout += chunk; });
      child.stderr?.on("data", (chunk) => { stderr += chunk; });
      const timeout = setTimeout(() => child.kill(), timeoutMs);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        const events = stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
          try { return [JSON.parse(line)]; } catch { return []; }
        });
        const reportedError = events.find((event) => event.event === "error");
        if (code !== 0 || reportedError) {
          reject(new Error(reportedError?.message || stderr.trim() || `检查进程退出：${code}`));
          return;
        }
        resolve(events);
      });
    });
  }

  async listDevices() {
    const events = await this.runOnce(["--list-devices-json"], 10000);
    return events.find((event) => event.event === "devices")?.devices || [];
  }

  async check() {
    this.validateStartConfig();
    const events = await this.runOnce(["--config", this.configPath, "--check"], 60000);
    const result = events.find((event) => event.event === "check-complete");
    if (!result) throw new Error("监听器检查未返回结果");
    this.log("check-complete", result.device?.name || "default-device");
    return result;
  }

  dispose() {
    if (!this.child || this.child.killed) return;
    try {
      this.child.stdin?.write("stop\n");
      this.child.kill();
    } catch {
      // Windows releases the device when the child terminates.
    }
    this.child = null;
  }
}

module.exports = {
  CONFIG_VERSION,
  WakeListenerManager,
  defaultWakeConfig,
  mergeWakeConfig,
};
