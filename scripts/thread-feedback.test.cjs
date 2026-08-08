const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

(async () => {
  const { hasWorkingToCompleteTransition } = await import("../src/thread-feedback.ts");
  const app = readFileSync(join(__dirname, "..", "src", "App.tsx"), "utf8");
  const sound = readFileSync(join(__dirname, "..", "src", "interaction-sound.ts"), "utf8");

  assert.equal(
    hasWorkingToCompleteTransition(
      [{ id: "thread-a", tone: "active" }],
      [{ id: "thread-a", tone: "complete" }],
    ),
    true,
  );
  assert.equal(
    hasWorkingToCompleteTransition(
      [{ id: "thread-a", tone: "active" }],
      [{ id: "thread-a", tone: "waiting" }],
    ),
    false,
  );
  assert.equal(
    hasWorkingToCompleteTransition(
      [{ id: "thread-a", tone: "complete" }],
      [{ id: "thread-a", tone: "complete" }],
    ),
    false,
  );
  assert.equal(
    hasWorkingToCompleteTransition(
      [],
      [{ id: "thread-a", tone: "complete" }],
    ),
    false,
  );
  assert.equal(
    hasWorkingToCompleteTransition(
      [
        { id: "thread-a", tone: "waiting" },
        { id: "thread-b", tone: "active" },
      ],
      [
        { id: "thread-a", tone: "complete" },
        { id: "thread-b", tone: "complete" },
      ],
    ),
    true,
  );
  assert.match(app, /useLayoutEffect\(\(\) => \{[\s\S]*hasWorkingToCompleteTransition\(previous, next\)[\s\S]*playInteractionSound\("complete"\)/);
  assert.match(sound, /complete:\s*\{[\s\S]*startFrequency:\s*520,[\s\S]*endFrequency:\s*760/);
  assert.match(sound, /export type InteractionSound = [^;]*"complete"/);

  console.log("thread-feedback: 8 assertions passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
