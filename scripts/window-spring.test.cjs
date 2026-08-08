const assert = require("node:assert/strict");
const {
  advanceBoundsSpring,
  boundsAreNear,
  createBoundsSpringState,
  isBoundsSpringSettled,
  projectCompactPlacement,
  roundedBounds,
  shouldRevealGesture,
} = require("../electron/window-spring.cjs");

const from = { x: -1194, y: 20, width: 1240, height: 120 };
const target = { x: 0, y: 20, width: 1240, height: 120 };
const spring = { stiffness: 520, damping: 40 };

assert.equal(shouldRevealGesture({ cancelled: false, inward: 43, inwardVelocity: 0 }), true);
assert.equal(shouldRevealGesture({ cancelled: false, inward: 18, inwardVelocity: 220 }), true);
assert.equal(shouldRevealGesture({ cancelled: false, inward: 18, inwardVelocity: -220 }), false);
assert.equal(shouldRevealGesture({ cancelled: true, inward: 80, inwardVelocity: 400 }), false);
assert.equal(boundsAreNear(target, { ...target, x: .8 }), true);
assert.equal(boundsAreNear(target, { ...target, x: 1.2 }), false);

const state = createBoundsSpringState(from, target, { x: 300 });
assert.equal(state.velocity.x, 300);
for (let index = 0; index < 360; index += 1) {
  advanceBoundsSpring(state, target, spring, 1 / 60);
}
assert.equal(isBoundsSpringSettled(state, target), true);
assert.deepEqual(roundedBounds(state), target);

const retargeted = createBoundsSpringState(roundedBounds(state), from, {}, { x: -180 });
assert.equal(retargeted.velocity.x, -180);

const morphTarget = { x: 817, y: 42, width: 286, height: 76 };
const morphState = createBoundsSpringState(
  { x: 340, y: 20, width: 1240, height: 120 },
  morphTarget,
);
const morphSpring = { stiffness: 260, damping: 35, clamp: true };
let previousWidth = morphState.value.width;
let previousX = morphState.value.x;
for (let index = 0; index < 240; index += 1) {
  advanceBoundsSpring(morphState, morphTarget, morphSpring, 1 / 60);
  assert.ok(morphState.value.width <= previousWidth, "morph width must not rebound");
  assert.ok(morphState.value.width >= morphTarget.width, "morph width must not overshoot");
  assert.ok(morphState.value.x >= previousX, "morph position must not rebound");
  assert.ok(morphState.value.x <= morphTarget.x, "morph position must not overshoot");
  previousWidth = morphState.value.width;
  previousX = morphState.value.x;
}
assert.deepEqual(roundedBounds(morphState), morphTarget);

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const freeCompact = projectCompactPlacement(
  { x: 720, y: 400, width: 286, height: 76 },
  workArea,
  { x: 240, y: -120 },
);
assert.equal(freeCompact.edge, null);
assert.deepEqual(freeCompact.target, { x: 739, y: 390, width: 286, height: 76 });

const leftSnap = projectCompactPlacement(
  { x: 34, y: 400, width: 286, height: 76 },
  workArea,
  { x: -260, y: 0 },
);
assert.equal(leftSnap.edge, "left");
assert.equal(leftSnap.target.x, 0);

const bottomSnap = projectCompactPlacement(
  { x: 800, y: 978, width: 286, height: 76 },
  workArea,
);
assert.equal(bottomSnap.edge, "bottom");
assert.equal(bottomSnap.target.y, 964);

console.log("window-spring: 977 assertions passed");
