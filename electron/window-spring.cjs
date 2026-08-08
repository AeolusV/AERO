const BOUNDS_KEYS = ["x", "y", "width", "height"];

function boundsAreNear(left, right, tolerance = 1) {
  return BOUNDS_KEYS.every((key) => (
    Math.abs(Number(left?.[key]) - Number(right?.[key])) <= tolerance
  ));
}

function createBoundsSpringState(from, target, initialVelocity = {}, carriedVelocity = {}) {
  const value = {};
  const velocity = {};
  for (const key of BOUNDS_KEYS) {
    value[key] = Number(from[key]);
    velocity[key] = Number(initialVelocity[key] ?? carriedVelocity[key] ?? 0);
  }
  return { value, velocity, target: { ...target } };
}

function advanceBoundsSpring(state, target, spring, deltaSeconds) {
  const delta = Math.min(0.032, Math.max(0.001, deltaSeconds));
  const substeps = Math.max(1, Math.ceil(delta / 0.016));
  const step = delta / substeps;

  for (let index = 0; index < substeps; index += 1) {
    for (const key of BOUNDS_KEYS) {
      const distanceBefore = target[key] - state.value[key];
      const acceleration = spring.stiffness * (target[key] - state.value[key])
        - spring.damping * state.velocity[key];
      state.velocity[key] += acceleration * step;
      state.value[key] += state.velocity[key] * step;
      const distanceAfter = target[key] - state.value[key];
      if (
        spring.clamp
        && distanceBefore !== 0
        && Math.sign(distanceBefore) !== Math.sign(distanceAfter)
      ) {
        state.value[key] = target[key];
        state.velocity[key] = 0;
      }
    }
  }
  return state;
}

function roundedBounds(state) {
  return Object.fromEntries(BOUNDS_KEYS.map((key) => {
    const rounded = Math.round(state.value[key]);
    return [key, Object.is(rounded, -0) ? 0 : rounded];
  }));
}

function isBoundsSpringSettled(state, target) {
  return BOUNDS_KEYS.every((key) => (
    Math.abs(target[key] - state.value[key]) < 0.45
    && Math.abs(state.velocity[key]) < 4
  ));
}

function shouldRevealGesture({ cancelled, inward, inwardVelocity, projectionSeconds = 0.14, threshold = 42 }) {
  if (cancelled) return false;
  return inward >= threshold || inward + inwardVelocity * projectionSeconds >= threshold;
}

function projectCompactPlacement(bounds, workArea, velocity = {}, {
  snapThreshold = 58,
  projectionSeconds = 0.08,
  maxProjection = 96,
} = {}) {
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  const projectedX = bounds.x + Math.max(-maxProjection, Math.min(maxProjection, Number(velocity.x || 0) * projectionSeconds));
  const projectedY = bounds.y + Math.max(-maxProjection, Math.min(maxProjection, Number(velocity.y || 0) * projectionSeconds));
  const target = {
    x: Math.round(Math.min(Math.max(projectedX, workArea.x), workArea.x + workArea.width - width)),
    y: Math.round(Math.min(Math.max(projectedY, workArea.y), workArea.y + workArea.height - height)),
    width,
    height,
  };
  const distances = [
    ["left", Math.abs(target.x - workArea.x)],
    ["right", Math.abs(target.x + width - (workArea.x + workArea.width))],
    ["top", Math.abs(target.y - workArea.y)],
    ["bottom", Math.abs(target.y + height - (workArea.y + workArea.height))],
  ].sort((left, right) => left[1] - right[1]);
  const edge = distances[0][1] <= snapThreshold ? distances[0][0] : null;
  if (edge === "left") target.x = workArea.x;
  if (edge === "right") target.x = workArea.x + workArea.width - width;
  if (edge === "top") target.y = workArea.y;
  if (edge === "bottom") target.y = workArea.y + workArea.height - height;
  return { edge, target };
}

module.exports = {
  BOUNDS_KEYS,
  advanceBoundsSpring,
  boundsAreNear,
  createBoundsSpringState,
  isBoundsSpringSettled,
  roundedBounds,
  projectCompactPlacement,
  shouldRevealGesture,
};
