import assert from "node:assert/strict";
import { moveControlBy, reorderControls } from "../src/control-order";
import type { ControlPreference } from "../src/types";

const controls: ControlPreference[] = [
  { id: "connection", enabled: true },
  { id: "threadSlots", enabled: true },
  { id: "reasoning", enabled: true },
  { id: "newTask", enabled: true },
];

const reordered = reorderControls(controls, "newTask", "threadSlots");
assert.deepEqual(reordered.map((control) => control.id), [
  "connection",
  "newTask",
  "threadSlots",
  "reasoning",
]);
assert.deepEqual(controls.map((control) => control.id), [
  "connection",
  "threadSlots",
  "reasoning",
  "newTask",
]);

const moved = moveControlBy(reordered, "reasoning", -1);
assert.deepEqual(moved.map((control) => control.id), [
  "connection",
  "newTask",
  "reasoning",
  "threadSlots",
]);

assert.equal(moveControlBy(moved, "connection", -1), moved);
assert.equal(reorderControls(moved, "connection", "connection"), moved);

console.log("control-order: 5 assertions passed");
