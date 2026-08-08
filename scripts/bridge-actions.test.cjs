const assert = require("node:assert/strict");
const {
  CodexBridge,
  threadToMarkdown,
} = require("../electron/codex-bridge.cjs");

async function main() {
  const calls = [];
  const externalUrls = [];
  const bridge = new CodexBridge({
    openExternal: async (url) => {
      externalUrls.push(url);
    },
    openPath: async () => "",
    openTerminal: async () => undefined,
    writeClipboard: () => undefined,
  });
  bridge.state.connection = "connected";
  bridge.state.threads = [{
    id: "thread",
    name: "Thread",
    preview: "",
    cwd: "",
    tone: "idle",
  }];
  bridge.state.activeThreadId = "thread";
  bridge.request = async (method, params) => {
    calls.push({ method, params });
    if (method === "thread/settings/update") return {};
    if (method === "remoteControl/enable") {
      return {
        status: "connected",
        serverName: "test",
        installationId: "installation",
        environmentId: "environment",
      };
    }
    if (method === "remoteControl/client/list") {
      return {
        data: [{
          clientId: "client",
          displayName: "Phone",
          deviceType: "mobile",
          platform: "ios",
          osVersion: null,
          deviceModel: null,
          appVersion: "1",
          lastSeenAt: null,
        }],
        nextCursor: null,
      };
    }
    if (method === "remoteControl/pairing/start") {
      return {
        pairingCode: "pairing",
        manualPairingCode: "123456",
        environmentId: "environment",
        expiresAt: 123,
      };
    }
    if (method === "remoteControl/pairing/status") return { claimed: true };
    if (method === "remoteControl/client/revoke") return {};
    throw new Error(`Unexpected method: ${method}`);
  };

  await bridge.action("setReasoningEffort", { effort: "high" });
  assert.equal(bridge.state.reasoningEffort, "high");
  assert.deepEqual(calls[0], {
    method: "thread/settings/update",
    params: { threadId: "thread", effort: "high" },
  });
  assert.equal(bridge.state.threads[0].reasoningEffort, "high");
  await assert.rejects(
    () => bridge.action("setReasoningEffort", { effort: "unsupported" }),
    /不支持的推理档位/,
  );
  bridge.handleMessage({
    method: "thread/settings/updated",
    params: { threadId: "thread", threadSettings: { effort: "xhigh" } },
  });
  assert.equal(bridge.state.reasoningEffort, "xhigh");
  assert.equal(bridge.state.threads[0].reasoningEffort, "xhigh");

  await bridge.action("selectThread", { threadId: "thread" });
  assert.equal(bridge.state.activeThreadId, "thread");
  assert.equal(externalUrls.at(-1), "codex://threads/thread");

  await bridge.setRemoteControl(true);
  assert.equal(bridge.state.remoteControl.status, "connected");
  assert.equal(bridge.state.remoteControl.clients.length, 1);

  await bridge.startRemotePairing(true);
  assert.equal(bridge.state.remoteControl.pairing.manualPairingCode, "123456");

  await bridge.refreshRemotePairing();
  assert.equal(bridge.state.remoteControl.pairing.claimed, true);

  await bridge.revokeRemoteClient("client");
  assert.deepEqual(
    [...new Set(calls.map((call) => call.method))],
    [
      "thread/settings/update",
      "remoteControl/enable",
      "remoteControl/client/list",
      "remoteControl/pairing/start",
      "remoteControl/pairing/status",
      "remoteControl/client/revoke",
    ],
  );

  const markdown = threadToMarkdown({
    name: "Task",
    turns: [{
      items: [
        { type: "userMessage", content: [{ type: "text", text: "Hello" }] },
        { type: "agentMessage", text: "World" },
      ],
    }],
  });
  assert.match(markdown, /^# Task/);
  assert.match(markdown, /## You\n\nHello/);
  assert.match(markdown, /## Codex\n\nWorld/);

  const recoveryCalls = [];
  const recoveryBridge = new CodexBridge({
    openExternal: async () => undefined,
    openPath: async () => "",
    openTerminal: async () => undefined,
    writeClipboard: () => undefined,
  });
  recoveryBridge.state.connection = "connected";
  recoveryBridge.state.threads = [{
    id: "desktop-thread",
    name: "Desktop Thread",
    preview: "",
    cwd: "",
    rolloutPath: "C:\\Users\\test\\.codex\\sessions\\rollout-desktop-thread.jsonl",
    tone: "idle",
  }];
  recoveryBridge.state.activeThreadId = "desktop-thread";
  let updateAttempts = 0;
  recoveryBridge.request = async (method, params) => {
    recoveryCalls.push({ method, params });
    if (method === "thread/settings/update" && updateAttempts++ === 0) {
      throw new Error("thread not found: desktop-thread");
    }
    if (method === "thread/resume") return { thread: { id: "desktop-thread" } };
    if (method === "thread/settings/update") return {};
    throw new Error(`Unexpected method: ${method}`);
  };
  await recoveryBridge.action("setReasoningEffort", { effort: "xhigh" });
  assert.equal(recoveryBridge.state.reasoningEffort, "xhigh");
  assert.deepEqual(recoveryCalls, [
    {
      method: "thread/settings/update",
      params: { threadId: "desktop-thread", effort: "xhigh" },
    },
    {
      method: "thread/resume",
      params: {
        threadId: "desktop-thread",
        path: "C:\\Users\\test\\.codex\\sessions\\rollout-desktop-thread.jsonl",
        excludeTurns: true,
      },
    },
    {
      method: "thread/settings/update",
      params: { threadId: "desktop-thread", effort: "xhigh" },
    },
  ]);
  assert.equal(recoveryBridge.state.threads[0].reasoningEffort, "xhigh");

  const failedBridge = new CodexBridge({
    openExternal: async () => undefined,
    openPath: async () => "",
    openTerminal: async () => undefined,
    writeClipboard: () => undefined,
  });
  failedBridge.state.connection = "connected";
  failedBridge.state.threads = [{
    id: "missing-thread",
    name: "Missing Thread",
    preview: "",
    cwd: "",
    rolloutPath: "C:\\missing-rollout.jsonl",
    tone: "idle",
  }];
  failedBridge.state.activeThreadId = "missing-thread";
  failedBridge.request = async (method) => {
    if (method === "thread/settings/update") throw new Error("thread not found: missing-thread");
    if (method === "thread/resume") throw new Error("no rollout found");
    throw new Error(`Unexpected method: ${method}`);
  };
  await assert.rejects(
    () => failedBridge.action("setReasoningEffort", { effort: "high" }),
    /no rollout found/,
  );
  assert.equal(failedBridge.state.reasoningEffort, "medium");

  const lockedCalls = [];
  const lockedBridge = new CodexBridge({
    openExternal: async () => undefined,
    openPath: async () => "",
    openTerminal: async () => undefined,
    writeClipboard: () => undefined,
  });
  lockedBridge.state.connection = "connected";
  lockedBridge.state.threads = [{
    id: "locked-thread",
    name: "Locked Desktop Thread",
    preview: "",
    cwd: "",
    rolloutPath: "C:\\locked-rollout.jsonl",
    tone: "active",
  }];
  lockedBridge.state.activeThreadId = "locked-thread";
  lockedBridge.request = async (method, params) => {
    lockedCalls.push({ method, params });
    if (method === "thread/settings/update") throw new Error("thread not found: locked-thread");
    if (method === "thread/resume") {
      throw new Error("failed to resume local thread recorder: 拒绝访问。 (os error 5)");
    }
    if (method === "config/value/write") return { version: "2" };
    if (method === "config/read") {
      return { config: { model_reasoning_effort: "high" } };
    }
    throw new Error(`Unexpected method: ${method}`);
  };
  await lockedBridge.action("setReasoningEffort", { effort: "high" });
  assert.equal(lockedBridge.state.reasoningEffort, "high");
  assert.equal(lockedBridge.defaultReasoningEffort, "high");
  assert.deepEqual(lockedCalls.slice(-2), [
    {
      method: "config/value/write",
      params: {
        keyPath: "model_reasoning_effort",
        value: "high",
        mergeStrategy: "upsert",
      },
    },
    {
      method: "config/read",
      params: { includeLayers: false },
    },
  ]);

  console.log("bridge-actions: 24 assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
