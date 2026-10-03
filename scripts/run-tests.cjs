// AERO original portions: Copyright (c) 2026 Aeolus. See LICENSE.
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

// Explicitly exclude live tests: no microphone, model download, hotkey or Codex session.
const tests = [
  "startup.test.cjs",
  "packaging.test.cjs",
  "signing.test.cjs",
  "release-workflow.test.cjs",
  "bridge-actions.test.cjs",
  "bridge-refresh.test.cjs",
  "desktop-compatibility.test.cjs",
  "control-order.test.ts",
  "thread-display.test.cjs",
  "thread-feedback.test.cjs",
  "thread-status.test.cjs",
  "thread-tooltip.test.cjs",
  "status-colors.test.cjs",
  "status-material.test.cjs",
  "lamp-settings.test.cjs",
  "motion-source.test.cjs",
  "window-spring.test.cjs",
];

let failures = 0;
for (const test of tests) {
  console.log(`\nTesting ${test}`);
  const result = spawnSync(process.execPath, [join(__dirname, test)], {
    cwd: join(__dirname, ".."), stdio: "inherit", windowsHide: true, timeout: 60_000,
  });
  if (result.error || result.status !== 0) {
    failures += 1;
    console.error(`${test} failed: ${result.error?.message || `exit ${result.status}, signal ${result.signal || "none"}`}`);
  }
}
console.log(`\n${tests.length - failures}/${tests.length} test scripts passed.`);
process.exitCode = failures ? 1 : 0;
