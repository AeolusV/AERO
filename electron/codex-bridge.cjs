const { EventEmitter } = require("node:events");
const { existsSync } = require("node:fs");
const { open, readFile, readdir, stat } = require("node:fs/promises");
const { spawn, execFileSync } = require("node:child_process");
const { basename, join } = require("node:path");
const { homedir } = require("node:os");

const LOCAL_ALERT_WINDOW_MS = 15 * 60 * 1000;
const STALE_ACTIVE_WINDOW_MS = 120000;
const STALE_PENDING_CALL_WINDOW_MS = 6 * 60 * 60 * 1000;
const LOCAL_DISCOVERY_CACHE_MS = 30000;
const LOCAL_REFRESH_INTERVAL_MS = 2000;
const SERVER_REFRESH_INTERVAL_MS = 15000;
const SUPPORTED_REASONING_EFFORTS = new Set(["low", "medium", "high", "xhigh"]);
const localDiscoveryCache = { root: "", expiresAt: 0, info: [] };
const localThreadCache = new Map();
const localTitlesCache = { root: "", expiresAt: 0, titles: new Map() };

function supportedReasoningEffort(value, fallback = null) {
  const effort = typeof value === "string" ? value.toLowerCase() : "";
  return SUPPORTED_REASONING_EFFORTS.has(effort) ? effort : fallback;
}

function missingThreadError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /thread not found|thread not loaded|no rollout found/i.test(message);
}

function activeRecorderError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to resume local thread recorder|access is denied|拒绝访问|os error 5/i.test(message);
}

function statusTone(status) {
  const type = typeof status === "string" ? status : status?.type;
  const flags = typeof status === "object" ? status?.activeFlags ?? [] : [];
  if (flags.includes("waitingOnApproval") || flags.includes("waitingOnUserInput")) return "waiting";
  if (type === "active") return "active";
  if (type === "systemError") return "error";
  return "idle";
}

function completedTone(status) {
  const value = typeof status === "string" ? status : status?.type ?? status?.status ?? "";
  if (/fail|error/i.test(value)) return "error";
  if (/interrupt|cancel/i.test(value)) return "idle";
  return "complete";
}

function displayThread(thread, index) {
  return {
    id: thread.id,
    name: thread.name || `任务 ${String(index + 1).padStart(2, "0")}`,
    preview: thread.preview || thread.cwd?.split(/[\\/]/).filter(Boolean).at(-1) || "Codex task",
    cwd: thread.cwd || "",
    updatedAt: thread.updatedAt,
    status: thread.status || null,
    tone: statusTone(thread.status),
  };
}

function threadUpdatedAtMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

async function sessionFiles(root, output = []) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return output;
  }
  await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sessionFiles(path, output);
    if (entry.isFile() && /^rollout-.*\.jsonl$/i.test(entry.name)) output.push(path);
  }));
  return output;
}

async function readSlice(path, start, length) {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function safeJson(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function callPayload(call) {
  const raw = call?.arguments ?? call?.input;
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string") return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function callNeedsAttention(call) {
  if (call?.name === "request_user_input") return true;
  if (!/exec_command|shell_command|^exec$/i.test(call?.name || "")) return false;
  const payload = callPayload(call);
  return payload?.sandbox_permissions === "require_escalated"
    || payload?.args?.sandbox_permissions === "require_escalated";
}

function localTone(tail, mtimeMs, nowMs = Date.now()) {
  let tone = nowMs - mtimeMs < STALE_ACTIVE_WINDOW_MS ? "active" : "idle";
  const pendingCalls = new Map();
  for (const line of tail.split("\n")) {
    const entry = safeJson(line);
    if (!entry) continue;
    if (entry.type === "event_msg") {
      const event = entry.payload;
      if (event?.type === "task_started") { tone = "active"; pendingCalls.clear(); }
      else if (event?.type === "task_complete") { tone = "complete"; pendingCalls.clear(); }
      else if (event?.type === "turn_aborted") { tone = /interrupt|cancel/i.test(event.reason || "") ? "idle" : "error"; pendingCalls.clear(); }
      else if (event?.type === "error") tone = "error";
      continue;
    }
    if (entry.type !== "response_item") continue;
    const item = entry.payload;
    if (["function_call", "custom_tool_call"].includes(item?.type) && item.call_id) {
      pendingCalls.set(item.call_id, item);
    }
    if (["function_call_output", "custom_tool_call_output"].includes(item?.type) && item.call_id) {
      pendingCalls.delete(item.call_id);
    }
  }
  if (tone === "active") {
    const waiting = [...pendingCalls.values()].some(callNeedsAttention);
    if (waiting) tone = "waiting";
  }
  const ageMs = nowMs - mtimeMs;
  if (tone === "active" && pendingCalls.size === 0 && ageMs > STALE_ACTIVE_WINDOW_MS) {
    tone = "idle";
  }
  if (tone === "active" && pendingCalls.size > 0 && ageMs > STALE_PENDING_CALL_WINDOW_MS) {
    tone = "idle";
  }
  if ((tone === "complete" || tone === "error") && ageMs > LOCAL_ALERT_WINDOW_MS) {
    tone = "idle";
  }
  return tone;
}

async function localThreadTitles(codexHome) {
  const titles = new Map();
  try {
    const content = await readFile(join(codexHome, "session_index.jsonl"), "utf8");
    for (const line of content.split("\n")) {
      const entry = safeJson(line);
      if (entry?.id && entry?.thread_name) titles.set(entry.id, entry.thread_name);
    }
  } catch {
    // Titles are optional; the project folder remains a stable label.
  }
  return titles;
}

async function cachedLocalThreadTitles(codexHome, nowMs) {
  if (localTitlesCache.root !== codexHome || nowMs >= localTitlesCache.expiresAt) {
    localTitlesCache.root = codexHome;
    localTitlesCache.expiresAt = nowMs + LOCAL_DISCOVERY_CACHE_MS;
    localTitlesCache.titles = await localThreadTitles(codexHome);
  }
  return localTitlesCache.titles;
}

async function recentSessionInfo(root, limit, nowMs) {
  if (localDiscoveryCache.root !== root || nowMs >= localDiscoveryCache.expiresAt) {
    const files = await sessionFiles(root);
    const info = (await Promise.all(files.map(async (path) => {
      try { return { path, info: await stat(path) }; } catch { return null; }
    }))).filter(Boolean).sort((a, b) => b.info.mtimeMs - a.info.mtimeMs);
    localDiscoveryCache.root = root;
    localDiscoveryCache.expiresAt = nowMs + LOCAL_DISCOVERY_CACHE_MS;
    localDiscoveryCache.info = info.slice(0, Math.max(limit * 2, 64));
  } else {
    localDiscoveryCache.info = (await Promise.all(localDiscoveryCache.info.map(async ({ path }) => {
      try { return { path, info: await stat(path) }; } catch { return null; }
    }))).filter(Boolean).sort((a, b) => b.info.mtimeMs - a.info.mtimeMs);
  }
  return localDiscoveryCache.info.slice(0, limit);
}

async function discoverLocalThreads(limit = 24, nowMs = Date.now()) {
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const info = await recentSessionInfo(join(codexHome, "sessions"), limit, nowMs);
  const titles = await cachedLocalThreadTitles(codexHome, nowMs);
  const threads = [];
  for (const item of info) {
    const fileName = basename(item.path);
    const id = fileName.match(/([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/i)?.[1];
    if (!id) continue;
    const cached = localThreadCache.get(item.path);
    if (cached && cached.size === item.info.size && cached.mtimeMs === item.info.mtimeMs) {
      threads.push({ ...cached.thread, name: titles.get(id) || cached.thread.name });
      continue;
    }
    const headLength = Math.min(item.info.size, 65536);
    const tailLength = Math.min(item.info.size, 524288);
    const [head, tail] = await Promise.all([
      readSlice(item.path, 0, headLength),
      readSlice(item.path, Math.max(0, item.info.size - tailLength), tailLength),
    ]);
    let cwd = "";
    for (const line of head.split("\n")) {
      const entry = safeJson(line);
      if (entry?.type === "session_meta") {
        cwd = entry.payload?.cwd || "";
        break;
      }
    }
    const project = cwd ? basename(cwd) : "Codex";
    const thread = {
      id,
      name: titles.get(id) || project,
      preview: project === "Codex" ? "本地任务" : cwd,
      cwd,
      rolloutPath: item.path,
      updatedAt: item.info.mtimeMs,
      status: null,
      tone: localTone(tail, item.info.mtimeMs, nowMs),
    };
    localThreadCache.set(item.path, {
      size: item.info.size,
      mtimeMs: item.info.mtimeMs,
      thread,
    });
    threads.push(thread);
  }
  return threads;
}

function initialRemoteControlState() {
  return {
    status: "unavailable",
    serverName: "",
    installationId: "",
    environmentId: null,
    clients: [],
    pairing: null,
    error: "",
  };
}

function normalizeRemoteControlStatus(result, current = initialRemoteControlState()) {
  return {
    ...current,
    status: result?.status || current.status,
    serverName: result?.serverName || current.serverName,
    installationId: result?.installationId || current.installationId,
    environmentId: result?.environmentId ?? current.environmentId,
    error: "",
  };
}

function threadToMarkdown(thread) {
  const title = thread?.name || thread?.preview || "Codex task";
  const sections = [`# ${title}`];
  for (const turn of thread?.turns || []) {
    for (const item of turn?.items || []) {
      if (item?.type === "userMessage") {
        const text = (item.content || [])
          .filter((content) => content?.type === "text")
          .map((content) => content.text)
          .filter(Boolean)
          .join("\n\n");
        if (text) sections.push(`## You\n\n${text}`);
      } else if (item?.type === "agentMessage" && item.text) {
        sections.push(`## Codex\n\n${item.text}`);
      } else if (item?.type === "plan" && item.text) {
        sections.push(`### Plan\n\n${item.text}`);
      }
    }
  }
  return `${sections.join("\n\n")}\n`;
}

async function localThreadToMarkdown(thread) {
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const files = await sessionFiles(join(codexHome, "sessions"));
  const path = files.find((candidate) => basename(candidate).includes(thread.id));
  if (!path) throw new Error(`未找到任务 ${thread.id} 的本地记录。`);
  const content = await readFile(path, "utf8");
  const sections = [`# ${thread.name || thread.preview || "Codex task"}`];
  for (const line of content.split("\n")) {
    const entry = safeJson(line);
    if (entry?.type !== "response_item") continue;
    const item = entry.payload;
    if (item?.type !== "message" || !["user", "assistant"].includes(item.role)) continue;
    const text = (item.content || [])
      .map((part) => part?.text)
      .filter(Boolean)
      .join("\n\n");
    if (!text) continue;
    sections.push(`## ${item.role === "user" ? "You" : "Codex"}\n\n${text}`);
  }
  return `${sections.join("\n\n")}\n`;
}

function resolveCodexBinary() {
  const candidates = [process.env.CODEX_BIN].filter(Boolean);
  if (process.platform === "win32") {
    if (process.env.APPDATA) candidates.push(join(process.env.APPDATA, "npm", "codex.cmd"));
    try {
      const commandCandidate = execFileSync("where.exe", ["codex.cmd"], { encoding: "utf8", windowsHide: true, timeout: 5000, stdio: ["ignore", "pipe", "ignore"] })
        .split(/\r?\n/)
        .map((value) => value.trim())
        .find(Boolean);
      if (commandCandidate) candidates.push(commandCandidate);
    } catch {
      // Continue to the packaged Desktop binary.
    }
  }
  try {
    const installLocation = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", "Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1 -ExpandProperty InstallLocation"],
      { encoding: "utf8", windowsHide: true, timeout: 10000, stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (installLocation) candidates.push(join(installLocation, "app", "resources", "codex.exe"));
  } catch {
    // Fall through to PATH resolution.
  }
  try {
    const pathCandidate = execFileSync("where.exe", ["codex.exe"], { encoding: "utf8", windowsHide: true, timeout: 5000, stdio: ["ignore", "pipe", "ignore"] })
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find(Boolean);
    if (pathCandidate) candidates.push(pathCandidate);
  } catch {
    // The packaged binary is preferred; PATH is only a fallback.
  }
  const binary = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!binary) throw new Error("未找到 Codex app-server。请安装或更新 Codex Desktop。 ");
  return binary;
}

function spawnCodex(binaryPath) {
  const args = ["-c", "features.code_mode_host=true", "app-server", "--analytics-default-enabled"];
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(binaryPath)) {
    return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/c", binaryPath, ...args], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
  return spawn(binaryPath, args, {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

class CodexBridge extends EventEmitter {
  constructor({ openExternal, openPath, openTerminal, writeClipboard }) {
    super();
    this.openExternal = openExternal;
    this.openPath = openPath || (async () => "");
    this.openTerminal = openTerminal || (async () => undefined);
    this.writeClipboard = writeClipboard || (() => undefined);
    this.process = null;
    this.connectingPromise = null;
    this.reconnectTimer = null;
    this.refreshTimer = null;
    this.reconnectAttempts = 0;
    this.disposed = false;
    this.buffer = "";
    this.requestId = 0;
    this.pending = new Map();
    this.approvals = new Map();
    this.threadAlerts = new Map();
    this.threadAcknowledgements = new Map();
    this.threadEfforts = new Map();
    this.serverThreads = [];
    this.serverThreadsRefreshedAt = 0;
    this.defaultReasoningEffort = "medium";
    this.state = {
      connection: "disconnected",
      error: "",
      binaryPath: "",
      threads: [],
      activeThreadId: null,
      activeTurnId: null,
      reasoningEffort: this.defaultReasoningEffort,
      pendingApproval: null,
      remoteControl: initialRemoteControlState(),
    };
  }

  snapshot() {
    return structuredClone(this.state);
  }

  publish(patch = {}) {
    this.state = { ...this.state, ...patch };
    this.emit("state", this.snapshot());
    return this.snapshot();
  }

  write(message) {
    if (!this.process?.stdin?.writable) throw new Error("Codex app-server 尚未连接。");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params = {}, timeoutMs = 20000) {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 请求超时`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout, method });
      this.write({ method, id, params });
    });
  }

  async connect() {
    if (this.disposed) throw new Error("Codex Bridge 已关闭。");
    if (this.process && !this.process.killed && this.state.connection === "connected") return this.snapshot();
    if (this.connectingPromise) return this.connectingPromise;
    this.connectingPromise = this.openConnection().finally(() => {
      this.connectingPromise = null;
    });
    return this.connectingPromise;
  }

  async openConnection() {
    this.publish({ connection: "connecting", error: "" });
    try {
      const binaryPath = resolveCodexBinary();
      const child = spawnCodex(binaryPath);
      this.process = child;
      this.publish({ binaryPath });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => this.consume(chunk));
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        const message = String(chunk).trim();
        if (message && this.state.connection !== "connected") this.publish({ error: message.slice(-360) });
      });
      child.on("error", (error) => this.fail(error));
      child.on("exit", (code) => {
        if (this.process !== child) return;
        this.process = null;
        this.stopRefreshLoop();
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timeout);
          pending.reject(new Error(`Codex app-server 已退出 (${code ?? "unknown"})`));
        }
        this.pending.clear();
        this.approvals.clear();
        this.publish({
          connection: "disconnected",
          activeTurnId: null,
          pendingApproval: null,
          error: code ? `app-server 已退出 (${code})，正在重新连接` : "正在重新连接",
        });
        this.scheduleReconnect();
      });

      await this.request("initialize", {
        clientInfo: { name: "codex_micro_bar", title: "Aero", version: "0.1.0" },
        capabilities: { experimentalApi: true, requestAttestation: false },
      });
      this.write({ method: "initialized" });
      this.publish({ connection: "connected", error: "" });
      await this.refreshReasoningEffort().catch(() => undefined);
      await this.refresh({ forceServer: true });
      await this.refreshRemoteControl().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.publish({
          remoteControl: {
            ...this.state.remoteControl,
            status: "unavailable",
            error: message,
          },
        });
      });
      this.reconnectAttempts = 0;
      this.startRefreshLoop();
      return this.snapshot();
    } catch (error) {
      this.fail(error);
      if (this.process && !this.process.killed) this.process.kill();
      else this.scheduleReconnect();
      throw error;
    }
  }

  scheduleReconnect() {
    if (this.disposed || this.reconnectTimer || this.process) return;
    const delay = Math.min(10000, 750 * (2 ** this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => undefined);
    }, delay);
  }

  startRefreshLoop() {
    this.stopRefreshLoop();
    if (this.disposed || this.state.connection !== "connected") return;
    this.refreshTimer = setTimeout(async () => {
      this.refreshTimer = null;
      try {
        await this.refresh();
        this.startRefreshLoop();
      } catch (error) {
        this.fail(error);
        if (this.process && !this.process.killed) this.process.kill();
        else this.scheduleReconnect();
      }
    }, LOCAL_REFRESH_INTERVAL_MS);
  }

  stopRefreshLoop() {
    if (!this.refreshTimer) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  fail(error) {
    const message = error instanceof Error ? error.message : String(error);
    this.publish({ connection: "error", error: message });
  }

  consume(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      try {
        this.handleMessage(JSON.parse(line));
      } catch {
        // Ignore non-JSON diagnostic lines from experimental builds.
      }
    }
  }

  handleMessage(message) {
    if (Object.prototype.hasOwnProperty.call(message, "result") || Object.prototype.hasOwnProperty.call(message, "error")) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || pending.method));
      else pending.resolve(message.result);
      return;
    }

    if (message.id != null && message.method?.includes("requestApproval")) {
      const approval = {
        requestId: message.id,
        method: message.method,
        title: message.params?.reason || message.params?.command || "Codex 需要批准",
        detail: message.params?.cwd || "",
        threadId: message.params?.threadId || message.params?.thread_id,
      };
      this.approvals.set(String(message.id), { rawId: message.id, ...approval });
      this.publish({ pendingApproval: approval });
      return;
    }

    if (message.method === "remoteControl/status/changed") {
      const remoteControl = normalizeRemoteControlStatus(message.params, this.state.remoteControl);
      this.publish({ remoteControl });
      if (remoteControl.status === "connected" && remoteControl.environmentId) {
        this.listRemoteClients().catch(() => undefined);
      }
      return;
    }

    if (message.method === "thread/status/changed") {
      const { threadId, status } = message.params || {};
      const tone = statusTone(status);
      if (tone === "active" || tone === "waiting") {
        this.threadAlerts.delete(threadId);
        this.threadAcknowledgements.delete(threadId);
      }
      this.publish({
        threads: this.state.threads.map((thread) => thread.id === threadId ? { ...thread, status, tone } : thread),
      });
      return;
    }

    if (message.method === "thread/settings/updated") {
      const threadId = message.params?.threadId;
      const effort = supportedReasoningEffort(message.params?.threadSettings?.effort);
      if (!threadId || !effort) return;
      this.threadEfforts.set(threadId, effort);
      this.publish({
        reasoningEffort: threadId === this.state.activeThreadId ? effort : this.state.reasoningEffort,
        threads: this.state.threads.map((thread) => (
          thread.id === threadId ? { ...thread, reasoningEffort: effort } : thread
        )),
      });
      return;
    }

    if (message.method === "turn/started") {
      const turn = message.params?.turn;
      const threadId = message.params?.threadId || this.state.activeThreadId;
      if (threadId) {
        this.threadAlerts.delete(threadId);
        this.threadAcknowledgements.delete(threadId);
      }
      this.publish({
        activeThreadId: threadId,
        activeTurnId: turn?.id || null,
        threads: this.state.threads.map((thread) => thread.id === threadId ? { ...thread, tone: "active" } : thread),
      });
      return;
    }

    if (message.method === "turn/completed") {
      const threadId = message.params?.threadId;
      const tone = completedTone(message.params?.turn?.status);
      if (threadId && (tone === "complete" || tone === "error")) this.threadAlerts.set(threadId, tone);
      this.publish({
        activeTurnId: null,
        threads: this.state.threads.map((thread) => thread.id === threadId ? { ...thread, tone } : thread),
      });
      this.refresh().catch(() => undefined);
    }
  }

  async refresh({ forceServer = false } = {}) {
    const nowMs = Date.now();
    if (forceServer || nowMs - this.serverThreadsRefreshedAt >= SERVER_REFRESH_INTERVAL_MS) {
      const result = await this.request("thread/list", {
        archived: false,
        limit: 100,
        sortKey: "recency_at",
        sortDirection: "desc",
      });
      this.serverThreads = (result?.data || []).map(displayThread);
      this.serverThreadsRefreshedAt = nowMs;
    }
    const localThreads = await discoverLocalThreads(32, nowMs);
    const localById = new Map(localThreads.map((thread) => [thread.id, thread]));
    const serverIds = new Set(this.serverThreads.map((thread) => thread.id));
    const discoveredThreads = this.serverThreads.length
      ? [
        ...this.serverThreads.map((thread) => {
          const local = localById.get(thread.id);
          return local ? { ...thread, ...local, name: thread.name || local.name } : thread;
        }),
        ...localThreads.filter((thread) => !serverIds.has(thread.id)),
      ].sort((a, b) => threadUpdatedAtMs(b.updatedAt) - threadUpdatedAtMs(a.updatedAt))
      : localThreads;
    const threads = discoveredThreads.map((thread) => {
      const alertTone = this.threadAlerts.get(thread.id);
      const reasoningEffort = this.threadEfforts.get(thread.id) || null;
      let tone = alertTone || thread.tone;
      const updatedAtMs = threadUpdatedAtMs(thread.updatedAt);
      const acknowledgedAt = this.threadAcknowledgements.get(thread.id) || 0;
      if (["active", "waiting"].includes(tone)) this.threadAcknowledgements.delete(thread.id);
      if (["complete", "error"].includes(tone) && updatedAtMs && updatedAtMs <= acknowledgedAt) tone = "idle";
      const next = reasoningEffort ? { ...thread, reasoningEffort, tone } : { ...thread, tone };
      return next;
    });
    const activeThreadId = this.state.activeThreadId || threads[0]?.id || null;
    return this.publish({
      threads,
      activeThreadId,
      reasoningEffort: this.threadEfforts.get(activeThreadId) || this.defaultReasoningEffort,
    });
  }

  async refreshReasoningEffort() {
    const result = await this.request("config/read", { includeLayers: false });
    const effort = supportedReasoningEffort(
      result?.config?.model_reasoning_effort,
      this.defaultReasoningEffort,
    );
    this.defaultReasoningEffort = effort;
    const activeEffort = this.threadEfforts.get(this.state.activeThreadId) || effort;
    return this.publish({ reasoningEffort: activeEffort });
  }

  async refreshRemoteControl() {
    const result = await this.request("remoteControl/status/read");
    const remoteControl = normalizeRemoteControlStatus(result, this.state.remoteControl);
    this.publish({ remoteControl });
    if (remoteControl.status === "connected" && remoteControl.environmentId) {
      await this.listRemoteClients();
    }
    return this.snapshot();
  }

  async setRemoteControl(enabled) {
    const result = await this.request(enabled ? "remoteControl/enable" : "remoteControl/disable", {
      ephemeral: false,
    });
    const remoteControl = normalizeRemoteControlStatus(result, {
      ...this.state.remoteControl,
      clients: enabled ? this.state.remoteControl.clients : [],
      pairing: enabled ? this.state.remoteControl.pairing : null,
    });
    this.publish({ remoteControl });
    if (enabled && remoteControl.environmentId) await this.listRemoteClients();
    return this.snapshot();
  }

  async startRemotePairing(manualCode = true) {
    if (this.state.remoteControl.status === "disabled" || this.state.remoteControl.status === "unavailable") {
      await this.setRemoteControl(true);
    }
    const result = await this.request("remoteControl/pairing/start", { manualCode });
    return this.publish({
      remoteControl: {
        ...this.state.remoteControl,
        environmentId: result.environmentId || this.state.remoteControl.environmentId,
        pairing: {
          pairingCode: result.pairingCode,
          manualPairingCode: result.manualPairingCode ?? null,
          environmentId: result.environmentId,
          expiresAt: result.expiresAt,
          claimed: false,
        },
        error: "",
      },
    });
  }

  async refreshRemotePairing() {
    const pairing = this.state.remoteControl.pairing;
    if (!pairing) return this.snapshot();
    const result = await this.request("remoteControl/pairing/status", {
      pairingCode: pairing.pairingCode,
      manualPairingCode: pairing.manualPairingCode,
    });
    const claimed = Boolean(result?.claimed);
    this.publish({
      remoteControl: {
        ...this.state.remoteControl,
        pairing: { ...pairing, claimed },
      },
    });
    if (claimed) await this.listRemoteClients();
    return this.snapshot();
  }

  async listRemoteClients() {
    const environmentId = this.state.remoteControl.environmentId;
    if (!environmentId) {
      return this.publish({
        remoteControl: { ...this.state.remoteControl, clients: [] },
      });
    }
    const result = await this.request("remoteControl/client/list", {
      environmentId,
      limit: 100,
      order: "desc",
    });
    return this.publish({
      remoteControl: {
        ...this.state.remoteControl,
        clients: Array.isArray(result?.data) ? result.data : [],
        error: "",
      },
    });
  }

  async revokeRemoteClient(clientId) {
    const environmentId = this.state.remoteControl.environmentId;
    if (!environmentId) throw new Error("远程控制尚未建立环境。");
    if (!clientId) throw new Error("缺少要撤销的客户端。");
    await this.request("remoteControl/client/revoke", { environmentId, clientId });
    return this.listRemoteClients();
  }

  activeThread() {
    return this.state.threads.find((thread) => thread.id === this.state.activeThreadId) || this.state.threads[0] || null;
  }

  async selectThread(threadId) {
    const selected = this.state.threads.find((thread) => thread.id === threadId);
    if (selected && ["complete", "error"].includes(selected.tone)) {
      this.threadAcknowledgements.set(threadId, threadUpdatedAtMs(selected.updatedAt) || Date.now());
    }
    this.threadAlerts.delete(threadId);
    this.publish({
      activeThreadId: threadId,
      activeTurnId: null,
      reasoningEffort: this.threadEfforts.get(threadId) || this.defaultReasoningEffort,
      threads: this.state.threads.map((thread) => (
        thread.id === threadId && (thread.tone === "complete" || thread.tone === "error")
          ? { ...thread, tone: "idle" }
          : thread
      )),
    });

    // Selecting a slot is a Desktop navigation action. `thread/resume` activates
    // a thread inside this companion's separate app-server process, but Codex
    // Desktop does not require it to navigate. Waiting for resume here can time
    // out and prevent the deeplink from ever reaching the Desktop app.
    await this.openExternal(`codex://threads/${encodeURIComponent(threadId)}`);
    return this.snapshot();
  }

  async setReasoningEffort(effort) {
    const nextEffort = supportedReasoningEffort(effort);
    if (!nextEffort) throw new Error(`不支持的推理档位：${effort}`);
    const thread = this.activeThread();
    if (!thread) throw new Error("当前没有可设置推理档位的任务。");
    const update = () => this.request("thread/settings/update", {
      threadId: thread.id,
      effort: nextEffort,
    });
    try {
      await update();
    } catch (error) {
      if (!missingThreadError(error)) throw error;
      let rolloutPath = thread.rolloutPath;
      if (!rolloutPath) {
        const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
        const files = await sessionFiles(join(codexHome, "sessions"));
        rolloutPath = files.find((candidate) => basename(candidate).includes(thread.id));
      }
      if (!rolloutPath) throw error;
      try {
        await this.request("thread/resume", {
          threadId: thread.id,
          path: rolloutPath,
          excludeTurns: true,
        });
        await update();
      } catch (resumeError) {
        if (!activeRecorderError(resumeError)) throw resumeError;
        await this.request("config/value/write", {
          keyPath: "model_reasoning_effort",
          value: nextEffort,
          mergeStrategy: "upsert",
        });
        const readback = await this.request("config/read", { includeLayers: false });
        const configuredEffort = supportedReasoningEffort(readback?.config?.model_reasoning_effort);
        if (configuredEffort !== nextEffort) {
          throw new Error(`Codex 未确认推理档位 ${nextEffort}。`);
        }
        this.defaultReasoningEffort = configuredEffort;
      }
    }
    this.threadEfforts.set(thread.id, nextEffort);
    return this.publish({
      reasoningEffort: nextEffort,
      threads: this.state.threads.map((item) => (
        item.id === thread.id ? { ...item, reasoningEffort: nextEffort } : item
      )),
    });
  }

  async newThread() {
    const cwd = this.activeThread()?.cwd || process.cwd();
    await this.openExternal(`codex://threads/new?path=${encodeURIComponent(cwd)}`);
    setTimeout(() => this.refresh().catch(() => undefined), 1200);
    return this.snapshot();
  }

  async forkThread() {
    const thread = this.activeThread();
    if (!thread) throw new Error("当前没有可继续到新任务的线程。");
    const result = await this.request("thread/fork", {
      threadId: thread.id,
      cwd: thread.cwd || undefined,
      excludeTurns: true,
    });
    const threadId = result?.thread?.id;
    if (!threadId) throw new Error("Codex 未返回新任务 ID。");
    await this.refresh();
    this.publish({ activeThreadId: threadId, activeTurnId: null });
    await this.openExternal(`codex://threads/${encodeURIComponent(threadId)}`);
    return this.snapshot();
  }

  async archiveThread() {
    const thread = this.activeThread();
    if (!thread) throw new Error("当前没有可归档的任务。");
    await this.request("thread/archive", { threadId: thread.id });
    this.threadAlerts.delete(thread.id);
    this.threadAcknowledgements.delete(thread.id);
    const threads = this.state.threads.filter((item) => item.id !== thread.id);
    const activeThreadId = threads[0]?.id || null;
    this.publish({ threads, activeThreadId, activeTurnId: null });
    if (activeThreadId) await this.openExternal(`codex://threads/${encodeURIComponent(activeThreadId)}`);
    else await this.openExternal("codex://launch");
    return this.snapshot();
  }

  async copyThreadMarkdown() {
    const thread = this.activeThread();
    if (!thread) throw new Error("当前没有可复制的任务。");
    let result;
    try {
      result = await this.request("thread/read", { threadId: thread.id, includeTurns: true }, 12000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Large or currently busy threads can make app-server history reads slow.
      // The rollout JSONL is the same local source and keeps Copy Markdown responsive.
      try {
        const markdown = await localThreadToMarkdown(thread);
        this.writeClipboard(markdown);
        return this.snapshot();
      } catch {
        // If no local rollout exists, preserve the protocol fallback below.
      }
      if (/请求超时|timed out/i.test(message)) {
        const title = thread.name || thread.preview || "Codex task";
        const markdown = [
          `# ${title}`,
          "",
          "> Codex 会话历史当前读取超时；已复制可用的任务摘要。",
          "",
          thread.preview || "",
          "",
          `- Task ID: ${thread.id}`,
          thread.cwd ? `- Working directory: ${thread.cwd}` : "",
          "",
        ].filter((line, index, lines) => line || lines[index - 1] !== "").join("\n");
        this.writeClipboard(markdown);
        return this.snapshot();
      }
      if (!/thread not loaded|no rollout found/i.test(message)) throw error;
      try {
        result = await this.request("thread/resume", {
          threadId: thread.id,
          excludeTurns: false,
        }, 12000);
      } catch (resumeError) {
        const resumeMessage = resumeError instanceof Error ? resumeError.message : String(resumeError);
        if (!/no rollout found|thread not loaded/i.test(resumeMessage)) throw resumeError;
      }
    }
    const markdown = result?.thread
      ? threadToMarkdown(result.thread)
      : await localThreadToMarkdown(thread);
    this.writeClipboard(markdown);
    return this.snapshot();
  }

  async openActiveFolder() {
    const cwd = this.activeThread()?.cwd;
    if (!cwd) throw new Error("当前任务没有工作目录。");
    const error = await this.openPath(cwd);
    if (error) throw new Error(error);
    return this.snapshot();
  }

  async openActiveTerminal() {
    const cwd = this.activeThread()?.cwd;
    if (!cwd) throw new Error("当前任务没有工作目录。");
    await this.openTerminal(cwd);
    return this.snapshot();
  }

  async continueTurn(effort = "medium") {
    let threadId = this.state.activeThreadId;
    if (!threadId) {
      const result = await this.request("thread/start", { cwd: process.cwd(), approvalPolicy: "on-request" });
      threadId = result.thread.id;
      this.publish({ activeThreadId: threadId });
    }
    try {
      await this.request("thread/resume", { threadId, approvalPolicy: "on-request" });
    } catch {
      // A newly created thread is already active and does not need resume.
    }
    await this.openExternal(`codex://threads/${encodeURIComponent(threadId)}`);
    const result = await this.request("turn/start", {
      threadId,
      effort,
      input: [{ type: "text", text: "继续当前任务。检查最新状态，并推进最有价值的下一步。", text_elements: [] }],
    });
    const nextEffort = supportedReasoningEffort(effort, this.defaultReasoningEffort);
    this.threadEfforts.set(threadId, nextEffort);
    return this.publish({
      activeTurnId: result?.turn?.id || null,
      reasoningEffort: nextEffort,
      threads: this.state.threads.map((thread) => (
        thread.id === threadId ? { ...thread, reasoningEffort: nextEffort } : thread
      )),
    });
  }

  async interrupt() {
    const threadId = this.state.activeThreadId;
    let turnId = this.state.activeTurnId;
    if (!threadId) throw new Error("当前没有可中断的任务。");
    if (!turnId) {
      try {
        const result = await this.request("thread/read", { threadId, includeTurns: true });
        const turns = result?.thread?.turns || [];
        const active = [...turns].reverse().find((turn) => /progress|active|running/i.test(typeof turn.status === "string" ? turn.status : turn.status?.type || ""));
        turnId = active?.id || null;
      } catch {
        // The current app-server may not expose turn history for an inactive bridge.
      }
    }
    if (!turnId) throw new Error("未找到正在运行的 turn；刷新后再试。");
    await this.request("turn/interrupt", { threadId, turnId });
    return this.publish({ activeTurnId: null });
  }

  resolveApproval(decision) {
    const pending = this.state.pendingApproval;
    if (!pending) throw new Error("当前没有待处理的批准请求。");
    const entry = this.approvals.get(String(pending.requestId));
    if (!entry) throw new Error("该批准请求已经失效。");
    this.write({ id: entry.rawId, result: { decision: decision === "accept" ? "accept" : "decline" } });
    this.approvals.delete(String(pending.requestId));
    const next = this.approvals.values().next().value || null;
    return this.publish({ pendingApproval: next ? {
      requestId: next.requestId,
      method: next.method,
      title: next.title,
      detail: next.detail,
      threadId: next.threadId,
    } : null });
  }

  async cycleProject() {
    const current = this.activeThread();
    const projects = [...new Set(this.state.threads.map((thread) => thread.cwd).filter(Boolean))];
    if (!projects.length) throw new Error("没有可切换的项目。");
    const nextCwd = projects[(projects.indexOf(current?.cwd) + 1) % projects.length];
    const next = this.state.threads.find((thread) => thread.cwd === nextCwd);
    if (next) return this.selectThread(next.id);
    return this.snapshot();
  }

  async action(action, payload = {}) {
    if (action === "connect") return this.connect();
    if (this.state.connection !== "connected" && !["openCodex", "openSettings", "newThread"].includes(action)) await this.connect();
    switch (action) {
      case "refresh": return this.refresh();
      case "selectThread": return this.selectThread(String(payload.threadId));
      case "newThread": return this.newThread();
      case "forkThread": return this.forkThread();
      case "archiveThread": return this.archiveThread();
      case "copyMarkdown": return this.copyThreadMarkdown();
      case "setReasoningEffort": return this.setReasoningEffort(String(payload.effort || ""));
      case "continue": return this.continueTurn(String(payload.effort || "medium"));
      case "interrupt": return this.interrupt();
      case "approval": return this.resolveApproval(payload.decision);
      case "openCodex": {
        const thread = this.activeThread();
        await this.openExternal(thread ? `codex://threads/${encodeURIComponent(thread.id)}` : "codex://launch");
        return this.snapshot();
      }
      case "openSettings": await this.openExternal("codex://settings"); return this.snapshot();
      case "openFolder": return this.openActiveFolder();
      case "openTerminal": return this.openActiveTerminal();
      case "openDocs": await this.openExternal("https://developers.openai.com/codex"); return this.snapshot();
      case "cycleProject": return this.cycleProject();
      case "remoteStatus": return this.refreshRemoteControl();
      case "remoteEnable": return this.setRemoteControl(true);
      case "remoteDisable": return this.setRemoteControl(false);
      case "remotePairingStart": return this.startRemotePairing(payload.manualCode !== false);
      case "remotePairingStatus": return this.refreshRemotePairing();
      case "remoteClients": return this.listRemoteClients();
      case "remoteRevoke": return this.revokeRemoteClient(String(payload.clientId || ""));
      default: throw new Error(`未知动作：${action}`);
    }
  }

  dispose() {
    this.disposed = true;
    this.stopRefreshLoop();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.process?.kill();
    this.process = null;
  }
}

module.exports = {
  CodexBridge,
  discoverLocalThreads,
  initialRemoteControlState,
  localTone,
  resolveCodexBinary,
  statusTone,
  threadToMarkdown,
};
