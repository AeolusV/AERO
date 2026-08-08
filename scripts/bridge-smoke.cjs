const assert = require("node:assert/strict");
const { CodexBridge } = require("../electron/codex-bridge.cjs");

async function main() {
  let copied = "";
  const bridge = new CodexBridge({
    openExternal: async () => undefined,
    openPath: async () => "",
    openTerminal: async () => undefined,
    writeClipboard: (text) => {
      copied = text;
    },
  });

  try {
    const state = await bridge.connect();
    assert.equal(state.connection, "connected");
    assert.ok([
      "disabled",
      "connecting",
      "connected",
      "errored",
      "unavailable",
    ].includes(state.remoteControl.status));

    if (state.threads.length) {
      await bridge.copyThreadMarkdown();
      assert.match(copied, /^# /);
    }

    console.log(JSON.stringify({
      connection: state.connection,
      threadCount: state.threads.length,
      remoteControlStatus: state.remoteControl.status,
      markdownRead: copied.length > 0,
    }));
  } finally {
    bridge.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
