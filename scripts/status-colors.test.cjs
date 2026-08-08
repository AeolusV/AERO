const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const styles = readFileSync(join(root, "src", "styles.css"), "utf8");
const app = readFileSync(join(root, "src", "App.tsx"), "utf8");
const bridge = require("../electron/codex-bridge.cjs");

const officialColors = {
  idle: "#fafafa",
  working: "#9cb6f6",
  complete: "#b4e3ba",
  waiting: "#f6e19d",
  error: "#f0a2bb",
};

for (const [name, color] of Object.entries(officialColors)) {
  assert.match(styles, new RegExp(`--official-${name}: ${color}`));
}

assert.equal(bridge.statusTone({ type: "active", activeFlags: [] }), "active");
assert.equal(bridge.statusTone({ type: "active", activeFlags: ["waitingOnUserInput"] }), "waiting");
assert.equal(bridge.statusTone({ type: "systemError", activeFlags: [] }), "error");
assert.match(app, /active: "工作中"/);
assert.match(app, /waiting: "需要输入"/);
assert.match(app, /complete: "已完成"/);
assert.match(app, /error: "错误"/);

console.log("status-colors: 12 assertions passed");
