const assert = require("node:assert/strict");
const { CodexBridge } = require("../electron/codex-bridge.cjs");
async function main() {
  const bridge = new CodexBridge({
    openExternal: async () => undefined,
    readLocalThreads: async () => [{ id: "fixture", name: "Fixture", tone: "active", updatedAt: Date.now() }],
  });
  bridge.state.connection = "connected";
  bridge.request = async () => { throw new Error("thread/list 请求超时"); };
  let state = await bridge.refresh({ forceServer: true });
  assert.equal(state.connection, "connected");
  assert.equal(state.threads[0].id, "fixture");
  assert.match(state.error, /本地任务/);
  bridge.request = async () => ({ data: [{ id: "server", name: "Server", status: "idle" }] });
  state = await bridge.refresh({ forceServer: true });
  assert.equal(state.error, "");
  assert.ok(state.threads.some(thread => thread.id === "server"));
  bridge.request = async () => { throw new Error("permission denied"); };
  await assert.rejects(bridge.refresh({ forceServer: true }), /permission denied/);
  bridge.dispose();
  console.log("bridge-refresh: timeout fallback, recovery and non-timeout propagation passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
