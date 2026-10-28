import type { Spread } from "@/types";
import { getSpreads, getTargets } from "@/utils/game-config";

/**
 * The window of spreads kept ready next to the current one: their targets stay loaded in the engine
 * (their pages are recognised at once and switch the spread by themselves) and their content is preloaded
 * (`PreloaderService.preloadSpreads()`). Nearest spreads first (the next before the previous).
 *
 * Setting (debug overlay, this device only):
 * - **grow** (default: holding every target of the book costs no frame rate or detection speed, only the
 *   one-time work per target): the current spread first, then the nearest spreads are
 *   added in idle time, a few targets at a time, until the whole book is held (`IImageTracker.growTargets()`).
 *   Nothing is dropped on a switch. Content is preloaded for ±1.
 * - ±n spreads (0, 1, 2) or all: a fixed window that slides with the current spread (`prepareTargets()`).
 * The engine load test sets a **target budget** instead (the nearest spreads until their targets reach it) while
 * it runs; the window follows every change at once.
 */
export type PreparedWindowSetting = "grow" | number;
export const PREPARED_WINDOW_SETTINGS: readonly PreparedWindowSetting[] = ["grow", 0, 1, 2, Infinity];
const RANGE_KEY = "osct-ar-prepared-spreads";
/** Content preload in grow mode: the neighbours (their media add up – the whole book stays a separate step) */
const GROW_CONTENT_RANGE = 1;

export const getPreparedWindowSetting = (): PreparedWindowSetting => {
  try {
    const stored = localStorage.getItem(RANGE_KEY);
    if (stored === "grow" || stored === null) return "grow";
    const range = stored === "all" ? Infinity : Number(stored);
    if (PREPARED_WINDOW_SETTINGS.includes(range)) return range;
  } catch {
    // storage blocked: default
  }
  return "grow";
};

/** The window as ±n spreads: the setting's range, or the neighbours in grow mode (content preload) */
export const getPreparedSpreadRange = (): number => {
  const setting = getPreparedWindowSetting();
  return setting === "grow" ? GROW_CONTENT_RANGE : setting;
};

/** The next setting in `PREPARED_WINDOW_SETTINGS`, stored – applies at once (the scene re-prepares its window) */
export const cyclePreparedSpreadRange = (): PreparedWindowSetting => {
  const next = PREPARED_WINDOW_SETTINGS[(PREPARED_WINDOW_SETTINGS.indexOf(getPreparedWindowSetting()) + 1) % PREPARED_WINDOW_SETTINGS.length];
  try {
    localStorage.setItem(RANGE_KEY, next === Infinity ? "all" : String(next));
  } catch {
    // storage blocked: stays at the default
  }
  windowListeners.forEach(listener => listener());
  return next;
};

let targetBudget: number | null = null;
const windowListeners = new Set<() => void>();

/** Target budget of the load test (other spreads' targets held next to the current spread), null = ±n range */
export const getTargetBudget = (): number | null => targetBudget;

export const setTargetBudget = (budget: number | null): void => {
  if (budget === targetBudget) return;
  targetBudget = budget;
  windowListeners.forEach(listener => listener());
};

/** The tracker grows its window towards the whole book (grow setting, no load test budget) */
export const isGrowingWindow = (): boolean => targetBudget === null && getPreparedWindowSetting() === "grow";

/** Called when the window changes outside a spread switch (setting changed, the load test's budget) */
export const subscribePreparedWindow = (listener: () => void): (() => void) => {
  windowListeners.add(listener);
  return () => windowListeners.delete(listener);
};

/** The other spreads, nearest first – at the same distance the next before the previous */
export const spreadsByDistance = (spreadId: string): Spread[] => {
  const spreads = getSpreads();
  const index = spreads.findIndex(spread => spread.id === spreadId);
  if (index === -1) return [];
  const ordered: Spread[] = [];
  for (let distance = 1; distance < spreads.length; distance++) {
    if (index + distance < spreads.length) ordered.push(spreads[index + distance]);
    if (index - distance >= 0) ordered.push(spreads[index - distance]);
  }
  return ordered;
};

/** The spreads kept ready next to `spreadId` (target budget while the load test runs, else ±range), nearest first */
export const getPreparedWindow = (spreadId: string, range = getPreparedSpreadRange(), budget = targetBudget): Spread[] => {
  const ordered = spreadsByDistance(spreadId);
  if (budget === null) {
    const index = getSpreads().findIndex(spread => spread.id === spreadId);
    const spreads = getSpreads();
    return ordered.filter(spread => Math.abs(spreads.indexOf(spread) - index) <= range);
  }
  const window: Spread[] = [];
  let targets = 0;
  for (const spread of ordered) {
    if (targets >= budget) break;
    window.push(spread);
    targets += getTargets(spread.id).length;
  }
  return window;
};
