import type { ControlId, ControlPreference } from "./types";

export function reorderControls(
  controls: ControlPreference[],
  draggedId: ControlId,
  targetId: ControlId,
) {
  if (draggedId === targetId) return controls;
  const from = controls.findIndex((control) => control.id === draggedId);
  const to = controls.findIndex((control) => control.id === targetId);
  if (from < 0 || to < 0) return controls;
  const next = [...controls];
  const [dragged] = next.splice(from, 1);
  next.splice(to, 0, dragged);
  return next;
}

export function moveControlBy(
  controls: ControlPreference[],
  controlId: ControlId,
  offset: -1 | 1,
) {
  const from = controls.findIndex((control) => control.id === controlId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= controls.length) return controls;
  return reorderControls(controls, controlId, controls[to].id);
}
