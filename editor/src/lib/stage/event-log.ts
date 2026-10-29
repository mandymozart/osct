/**
 * The stage's event log as the Stage panel lists it (three-free): the newest first, at most `EVENT_LOG_SIZE`.
 * A **state** event (`sceneState`) reports what the scene is, not that something happened – it is logged once per
 * change: the same state again (the scene re-asked to run on every spread open or refresh) adds nothing.
 */

export interface StageEvent {
  event: string;
  detail: string;
}

/** How many events the panel keeps */
export const EVENT_LOG_SIZE = 12;

/** Events that carry a state: logged only when it differs from the last one of their kind */
const STATE_EVENTS = new Set(["sceneState"]);

/** The log with `entry` added – or the same log when it repeats the current value of a state event */
export const logEvent = (log: readonly StageEvent[], entry: StageEvent, size = EVENT_LOG_SIZE): StageEvent[] => {
  if (STATE_EVENTS.has(entry.event) && log.find(e => e.event === entry.event)?.detail === entry.detail) return log as StageEvent[];
  return [entry, ...log].slice(0, size);
};
