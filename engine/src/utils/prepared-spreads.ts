import type { Spread } from "../types/index";
import { getSpreads, getTargets } from "../content/game-config";
import { readSwitch, writeSwitch } from "./device-storage";

/**
 * The window of spreads kept ready next to the current one: their targets stay loaded in the engine
 * (their pages are recognised at once and switch the spread by themselves) and their content is preloaded
 * (`PreloaderService.preloadSpreads()`). Nearest spreads first (the next before the previous).
 *
 * Setting (debug overlay, this device only – in the app's storage, `device-storage.ts`):
 * - ±n spreads (0, 1, 2) or all: a fixed window that slides with the current spread (`prepareTargets()`).
 *   **±1 is the default**: the next and the previous spread switch by themselves.
 * - **grow**: the current spread first, then the nearest spreads are added in idle time, a few targets at a time,
 *   until the whole book is held (`IImageTracker.growTargets()`). Nothing is dropped on a switch. Content is
 *   preloaded for ±1. Not the default: with the whole book held, pages of a printout were no longer found.
 * The engine load test sets a **target budget** instead (the nearest spreads until their targets reach it) while
 * it runs; the window follows every change at once.
 * The trigger trial overrides the setting with ±1 while its panel is open (`setWindowOverride()`, not stored), so the
 * next page is found by itself while the sheet is scanned in order, and nothing beyond the neighbours is prepared or
 * preloaded: a target that is not found is down to the engine and the printout, not to work in the background.
 */
export type PreparedWindowSetting = "grow" | number;
export const PREPARED_WINDOW_SETTINGS: readonly PreparedWindowSetting[] = ["grow", 0, 1, 2, Infinity];
const RANGE_KEY = "ar-prepared-spreads";
const DEFAULT_WINDOW: PreparedWindowSetting = 1;
/** Content preload in grow mode: the neighbours (their media add up – the whole book stays a separate step) */
const GROW_CONTENT_RANGE = 1;

let windowOverride: PreparedWindowSetting | null = null;

/** The setting in force: the trial's override while it is open, else the stored one */
export const getPreparedWindowSetting = (): PreparedWindowSetting => windowOverride ?? getStoredWindowSetting();

/** The setting chosen in the debug overlay (stored on this device), regardless of an override */
export const getStoredWindowSetting = (): PreparedWindowSetting => {
  const stored = readSwitch(RANGE_KEY);
  if (stored === "grow") return "grow";
  if (stored === null) return DEFAULT_WINDOW;
  const range = stored === "all" ? Infinity : Number(stored);
  return PREPARED_WINDOW_SETTINGS.includes(range) ? range : DEFAULT_WINDOW;
};

/** The window as ±n spreads: the setting's range, or the neighbours in grow mode (content preload) */
export const getPreparedSpreadRange = (): number => {
  const setting = getPreparedWindowSetting();
  return setting === "grow" ? GROW_CONTENT_RANGE : setting;
};

/** The next setting in `PREPARED_WINDOW_SETTINGS`, stored – applies at once (the scene re-prepares its window) */
export const cyclePreparedSpreadRange = (): PreparedWindowSetting => {
  const next = PREPARED_WINDOW_SETTINGS[(PREPARED_WINDOW_SETTINGS.indexOf(getStoredWindowSetting()) + 1) % PREPARED_WINDOW_SETTINGS.length];
  writeSwitch(RANGE_KEY, next === Infinity ? "all" : String(next));
  windowListeners.forEach(listener => listener());
  return next;
};

let targetBudget: number | null = null;
const windowListeners = new Set<() => void>();

/** Overrides the stored setting until it is set back to null (the trial panel: ±1) – applies at once, not stored */
export const setWindowOverride = (setting: PreparedWindowSetting | null): void => {
  if (setting === windowOverride) return;
  windowOverride = setting;
  windowListeners.forEach(listener => listener());
};

export const getWindowOverride = (): PreparedWindowSetting | null => windowOverride;

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
