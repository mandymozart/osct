/**
 * How many spreads on each side of the current one the tracker keeps loaded (`prepareTargets()`): their pages
 * are recognised at once and switch the spread by themselves. 1 = the neighbours (default – Tilman,
 * 2026-09-28: scales to any book size), `Infinity` = the whole book. Changed in the debug overlay (this device
 * only), e.g. to find out how many targets the engine keeps before finding or frame rate suffer.
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
