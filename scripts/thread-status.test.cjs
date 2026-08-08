const assert = require("node:assert/strict");
const { localTone } = require("../electron/codex-bridge.cjs");

const now = 1_800_000_000_000;
const line = (type, payload) => JSON.stringify({ type, payload });
const event = (type, extra = {}) => line("event_msg", { type, ...extra });
const item = (payload) => line("response_item", payload);
const tail = (...entries) => entries.join("\n");

assert.equal(localTone("", now - 180_000, now), "idle");
assert.equal(localTone("", now - 60_000, now), "active");
assert.equal(localTone(event("task_started"), now, now), "active");
assert.equal(
  localTone(tail(
    event("task_started"),
    item({ type: "function_call", call_id: "input", name: "request_user_input", arguments: "{}" }),
  ), now - 600_000, now),
  "waiting",
);
assert.equal(
  localTone(tail(
    event("task_started"),
    item({
      type: "custom_tool_call",
      call_id: "approval",
      name: "exec",
      input: JSON.stringify({ args: { sandbox_permissions: "require_escalated" } }),
    }),
  ), now, now),
  "waiting",
);
assert.equal(
  localTone(tail(
    event("task_started"),
    item({ type: "custom_tool_call", call_id: "tool", name: "exec", input: "{}" }),
  ), now - 600_000, now),
  "active",
);
assert.equal(
  localTone(tail(
    event("task_started"),
    item({ type: "custom_tool_call", call_id: "tool", name: "exec", input: "{}" }),
    item({ type: "custom_tool_call_output", call_id: "tool" }),
  ), now - 180_000, now),
  "idle",
);
assert.equal(localTone(tail(event("task_started"), event("task_complete")), now - 300_000, now), "complete");
assert.equal(localTone(tail(event("task_started"), event("task_complete")), now - 1_000_000, now), "idle");
assert.equal(localTone(tail(event("task_started"), event("turn_aborted", { reason: "system error" })), now, now), "error");
assert.equal(localTone(tail(event("task_complete"), event("task_started")), now, now), "active");

console.log("thread-status: 11 assertions passed");
