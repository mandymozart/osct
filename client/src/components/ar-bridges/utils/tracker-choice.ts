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

/**
 * How many spreads on each side of the current one the 8th Wall tracker keeps loaded (`prepareTargets()`):
 * 1 = the neighbours (default), `Infinity` = the whole book – the knob for the load test of the engine
 * (how many targets it keeps before finding or frame rate suffer). Debug overlay, this device only.
 */
export const PREPARED_SPREAD_RANGES = [0, 1, 2, Infinity] as const;
const RANGE_KEY = "osct-ar-prepared-spreads";

export const getPreparedSpreadRange = (): number => {
  try {
    const stored = localStorage.getItem(RANGE_KEY);
    const range = stored === "all" ? Infinity : Number(stored);
    if (stored !== null && (PREPARED_SPREAD_RANGES as readonly number[]).includes(range)) return range;
  } catch {
    // storage blocked: default
  }
  return 1;
};

/** The next range in `PREPARED_SPREAD_RANGES`, stored – applies when the next spread is ready */
export const cyclePreparedSpreadRange = (): number => {
  const ranges = PREPARED_SPREAD_RANGES as readonly number[];
  const next = ranges[(ranges.indexOf(getPreparedSpreadRange()) + 1) % ranges.length];
  try {
    localStorage.setItem(RANGE_KEY, next === Infinity ? "all" : String(next));
  } catch {
    // storage blocked: stays at the default
  }
  return next;
};
