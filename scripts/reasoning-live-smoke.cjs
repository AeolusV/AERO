const assert = require("node:assert/strict");
const { CodexBridge } = require("../electron/codex-bridge.cjs");

async function main() {
  const bridge = new CodexBridge({
    openExternal: async () => undefined,
    openPath: async () => "",
    openTerminal: async () => undefined,
    writeClipboard: () => undefined,
  });

  try {
    const connected = await bridge.connect();
    assert.equal(connected.connection, "connected");
    const requestedThreadId = process.argv[2];
    if (requestedThreadId) {
      const requestedThread = connected.threads.find((item) => item.id === requestedThreadId);
      assert.ok(requestedThread, `Requested thread ${requestedThreadId} was not discovered`);
      bridge.state.activeThreadId = requestedThreadId;
    }
    const thread = bridge.activeThread();
    assert.ok(thread, "No active Codex thread was discovered");
    assert.ok(thread.rolloutPath, "The active Desktop thread has no rollout path");

    const original = connected.reasoningEffort;
    const alternate = original === "high" ? "medium" : "high";
    const changed = await bridge.setReasoningEffort(alternate);
    assert.equal(changed.reasoningEffort, alternate);
    const restored = await bridge.setReasoningEffort(original);
    assert.equal(restored.reasoningEffort, original);

    console.log(JSON.stringify({
      connection: connected.connection,
      threadId: thread.id,
      rolloutPath: thread.rolloutPath,
      original,
      changedTo: alternate,
      restoredTo: restored.reasoningEffort,
    }));
  } finally {
    bridge.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
