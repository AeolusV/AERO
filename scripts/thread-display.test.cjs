const assert = require("node:assert/strict");

(async () => {
  const { workspaceNameFromCwd } = await import("../src/thread-display.ts");

  assert.equal(workspaceNameFromCwd("C:/Projects/Aero"), "Aero");
  assert.equal(workspaceNameFromCwd("C:\\Projects\\Aero\\"), "Aero");
  assert.equal(workspaceNameFromCwd("/Users/aeolus/Workspace"), "Workspace");
  assert.equal(workspaceNameFromCwd(""), "Codex 工作区");
  assert.equal(workspaceNameFromCwd(undefined), "Codex 工作区");

  console.log("thread-display: 5 assertions passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
