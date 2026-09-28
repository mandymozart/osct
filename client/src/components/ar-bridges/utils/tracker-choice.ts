/**
 * The image tracking engine of the AR scene – MindAR (default) or the 8th Wall engine, side by side for the
 * comparison on the phones (exploration "webworker tracking", 2026-09-28, agents/research/webworker-tracking.md).
 * Build flag `VITE_AR_TRACKER`; the debug overlay overrides it on one device (stored, applied after a reload).
 */
export const TRACKER_ENGINES = ["mindar", "8thwall"] as const;
export type TrackerEngine = (typeof TRACKER_ENGINES)[number];

const STORAGE_KEY = "osct-ar-tracker";

const isTrackerEngine = (value: unknown): value is TrackerEngine =>
  TRACKER_ENGINES.includes(value as TrackerEngine);

/** The device override if set, else the build flag, else MindAR */
export const getTrackerEngine = (): TrackerEngine => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTrackerEngine(stored)) return stored;
  } catch {
    // storage blocked: the build flag decides
  }
  const flag = import.meta.env.VITE_AR_TRACKER;
  return isTrackerEngine(flag) ? flag : "mindar";
};

/** Override the engine on this device (null: back to the build flag) – takes effect after a reload */
export const setTrackerEngine = (engine: TrackerEngine | null): void => {
  try {
    if (engine) localStorage.setItem(STORAGE_KEY, engine);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: nothing to remember
  }
};
