const assert = require("node:assert/strict");
const { CodexBridge } = require("../electron/codex-bridge.cjs");
const { validateVoiceBinding } = require("../electron/wake-listener-manager.cjs");

async function main() {
  const read = (entries) => () => JSON.stringify(entries);
  assert.throws(() => validateVoiceBinding(undefined, "fixture", read([
    { command: "composer.startVoiceMode", key: null },
    { command: "realtimeVoice", key: null },
  ])), /未绑定/);
  assert.throws(() => validateVoiceBinding(undefined, "fixture", () => { throw new Error("missing"); }), /无法确认/);
  assert.throws(() => validateVoiceBinding(undefined, "fixture", read([
    { command: "composer.startVoiceMode", key: "Ctrl+Shift+A" },
  ])), /未绑定/);
  validateVoiceBinding(undefined, "fixture", read([
    { command: "realtimeVoice", key: "Control+Shift+V" },
  ]));

  const bridge = new CodexBridge({ openExternal: async () => undefined });
  bridge.request = async (method) => {
    if (method === "config/read") return { config: { model: "current", model_reasoning_effort: "ultra" } };
    if (method === "model/list") return { data: [{ model: "current", supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"].map(reasoningEffort => ({ reasoningEffort })) }] };
    throw new Error(method);
  };
  await bridge.refreshReasoningEffort();
  assert.equal(bridge.state.reasoningEffort, "ultra");
  assert.deepEqual(bridge.state.reasoningEfforts, ["low", "medium", "high", "xhigh", "max", "ultra"]);
  bridge.dispose();
  console.log("desktop-compatibility: 6 checks passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
