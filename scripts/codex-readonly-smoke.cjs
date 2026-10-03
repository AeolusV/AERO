// Explicit live diagnostic. Reads status only; never submits a task or changes settings.
const { CodexBridge } = require("../electron/codex-bridge.cjs");
const bridge = new CodexBridge({
  openExternal: async () => { throw new Error("Navigation is not permitted by this diagnostic"); },
});
let method = "connect";
const request = bridge.request.bind(bridge);
bridge.request = (...args) => { method = args[0]; return request(...args); };
const timeout = setTimeout(() => {
  console.error("CODEX_READONLY_FAILED timeout");
  bridge.dispose();
  process.exitCode = 1;
}, 30000);
bridge.connect().then(state => {
  console.log("CODEX_READONLY_OK " + JSON.stringify({
    connection: state.connection,
    localFallback: Boolean(bridge.threadListWarning),
    threadCount: state.threads.length,
    reasoningEffort: state.reasoningEffort,
    reasoningEfforts: state.reasoningEfforts,
  }));
}).catch(error => {
  // Do not print backend messages which might contain private paths or content.
  const category = /超时|timeout|timed out/i.test(error.message) ? "timeout"
    : /ENOENT|未找到/i.test(error.message) ? "missing-binary"
    : /EPERM|denied|拒绝/i.test(error.message) ? "permission"
    : "backend-error";
  console.error("CODEX_READONLY_FAILED " + JSON.stringify({ category, method }));
  process.exitCode = 1;
}).finally(() => { clearTimeout(timeout); bridge.dispose(); });
