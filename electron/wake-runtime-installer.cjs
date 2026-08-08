const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class WakeRuntimeInstaller extends EventEmitter {
  constructor({ app, scriptPath, spawnImpl = spawn }) {
    super();
    this.app = app;
    this.scriptPath = scriptPath;
    this.spawnImpl = spawnImpl;
    this.runtimeRoot = join(app.getPath("userData"), "wake-runtime");
    this.pythonPath = join(this.runtimeRoot, "venv", "Scripts", "python.exe");
    this.modelPath = join(this.runtimeRoot, "models", "vosk-model-small-en-us-0.15");
    this.child = null;
    this.installPromise = null;
    const ready = existsSync(this.pythonPath) && existsSync(this.modelPath);
    this.state = {
      status: ready ? "ready" : "idle",
      progress: ready ? 100 : 0,
      message: ready ? "本地运行环境已配置" : "尚未配置 AERO 托管运行环境",
      pythonPath: ready ? this.pythonPath : "",
      modelPath: ready ? this.modelPath : "",
      runtimeRoot: this.runtimeRoot,
    };
  }

  snapshot() {
    return clone(this.state);
  }

  updateState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit("state", this.snapshot());
  }

  install() {
    if (this.installPromise) return this.installPromise;
    this.updateState({ status: "checking", progress: 1, message: "正在准备一键配置" });
    this.installPromise = new Promise((resolve, reject) => {
      const child = this.spawnImpl("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        this.scriptPath,
        "-RuntimeRoot",
        this.runtimeRoot,
      ], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });
      this.child = child;
      let stdout = "";
      let stderr = "";
      let complete = null;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        this.child = null;
        this.installPromise = null;
        if (error) reject(error);
        else resolve(this.snapshot());
      };

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        const lines = stdout.split(/\r?\n/);
        stdout = lines.pop() || "";
        for (const line of lines.filter(Boolean)) {
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          if (event.event === "complete") complete = event;
          this.updateState({
            status: event.status || this.state.status,
            progress: Number.isFinite(Number(event.progress)) ? Number(event.progress) : this.state.progress,
            message: event.message || this.state.message,
            pythonPath: event.pythonPath || this.state.pythonPath,
            modelPath: event.modelPath || this.state.modelPath,
          });
        }
      });
      child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-6000); });
      child.once("error", (error) => {
        this.updateState({ status: "error", progress: 0, message: error.message });
        finish(error);
      });
      child.once("close", (code) => {
        if (code === 0 && complete) {
          this.updateState({
            status: "ready",
            progress: 100,
            message: "本地运行环境已配置",
            pythonPath: complete.pythonPath,
            modelPath: complete.modelPath,
          });
          finish();
          return;
        }
        const message = this.state.status === "error"
          ? this.state.message
          : stderr.trim() || `一键配置进程异常退出（${code ?? "unknown"}）`;
        const error = new Error(message);
        this.updateState({ status: "error", progress: 0, message });
        finish(error);
      });
    });
    return this.installPromise;
  }

  dispose() {
    if (!this.child || this.child.killed) return;
    this.child.kill();
    this.child = null;
  }
}

module.exports = { WakeRuntimeInstaller };
