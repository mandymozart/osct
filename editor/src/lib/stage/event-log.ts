/**
 * The stage's event timeline as the Stage panel lists it (three-free): the newest first, at most `EVENT_LOG_SIZE`,
 * each event with the time since the spread opened, its name and its payload.
 * A **state** event (`sceneState`) reports what the scene is, not that something happened – it is logged once per
 * change: the same state again (the scene re-asked to run on every spread open or refresh) adds nothing.
 */

export interface StageEvent {
  event: string;
  /** The payload as one line (`targetId: "key" · …`), empty without one */
  detail: string;
  /** Milliseconds since the spread on the stage opened */
  at: number;
}

/** How many events the panel keeps */
export const EVENT_LOG_SIZE = 100;

/** Events that carry a state: logged only when it differs from the last one of their kind */
const STATE_EVENTS = new Set(["sceneState"]);

/** The log with `entry` added – or the same log when it repeats the current value of a state event */
export const logEvent = (log: readonly StageEvent[], entry: StageEvent, size = EVENT_LOG_SIZE): StageEvent[] => {
  if (STATE_EVENTS.has(entry.event) && log.find(e => e.event === entry.event)?.detail === entry.detail) return log as StageEvent[];
  return [entry, ...log].slice(0, size);
};

/** An event's payload as one line: an object's fields `key: value` joined by ` · `, anything else as text */
export const describePayload = (payload: unknown): string => {
  if (payload === undefined) return "";
  if (typeof payload === "object" && payload !== null) {
    return Object.entries(payload as Record<string, unknown>).map(([k, v]) => `${k}: ${v === undefined ? "–" : JSON.stringify(v)}`).join(" · ");
  }
  return String(payload);
};

/** The time since the spread opened as the timeline shows it: `4.25 s` under a minute, `1:05.3` after */
export const formatElapsed = (ms: number): string => {
  const hundredths = Math.round(Math.max(0, ms) / 10);
  if (hundredths < 6000) return `${(hundredths / 100).toFixed(2)} s`;
  const tenths = Math.round(hundredths / 10);
  const minutes = Math.floor(tenths / 600);
  return `${minutes}:${((tenths - minutes * 600) / 10).toFixed(1).padStart(4, "0")}`;
};
