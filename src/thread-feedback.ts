import type { ThreadTone } from "./types";

export type ThreadToneSnapshot = {
  id: string;
  tone: ThreadTone;
};

export function hasWorkingToCompleteTransition(
  previous: readonly ThreadToneSnapshot[],
  next: readonly ThreadToneSnapshot[],
) {
  const previousTones = new Map(previous.map((thread) => [thread.id, thread.tone]));
  return next.some(
    (thread) => previousTones.get(thread.id) === "active" && thread.tone === "complete",
  );
}
