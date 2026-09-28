import { ProgressRecord } from "@/types";
import { isEntryCategory } from "@shared/guards/game-config";
import { parseVersion } from "./version";

/**
 * Storage format of the progress record = the app MAJOR that wrote it (RULES #10). Each new MAJOR adds
 * one reader per older format that converts it to the current shape; there is no generic migration
 * framework. Legacy numeric `ar-game-*` keys predate format 1 and are not converted.
 */
export const PROGRESS_FORMAT = parseVersion(__VITE_APP_VERSION__)?.major ?? 0;

export type ProgressReadStatus = "new" | "current" | "converted" | "unreadable";

export interface ProgressReadResult {
  record: ProgressRecord;
  status: ProgressReadStatus;
}

export const createProgressRecord = (bookId: string): ProgressRecord => ({
  format: PROGRESS_FORMAT,
  bookId,
  appVersions: [],
  unlocked: {},
  consulted: {},
  lastSpreadId: null,
  lastCategory: null,
  onboarded: false,
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pick = <T>(value: unknown, isValue: (v: unknown) => v is T): Record<string, T> =>
  isObject(value)
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, T] => isValue(entry[1])))
    : {};

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === "string";

/** Format 1 (app 1.x) and 2: the record as defined in `types/history.ts`; malformed and unknown fields are dropped. */
const readFormat1 = (raw: Record<string, unknown>, bookId: string): ProgressRecord => ({
  ...createProgressRecord(bookId),
  appVersions: Array.isArray(raw.appVersions) ? raw.appVersions.filter(isString) : [],
  unlocked: pick(raw.unlocked, isNumber),
  consulted: pick(raw.consulted, isNumber),
  lastSpreadId: isString(raw.lastSpreadId) ? raw.lastSpreadId : null,
  lastCategory: isEntryCategory(raw.lastCategory) ? raw.lastCategory : null,
  // Additive field within format 1: records without it count as not onboarded
  onboarded: raw.onboarded === true,
});

/** One reader per storage format, each returns the current shape */
export const PROGRESS_READERS: Record<number, (raw: Record<string, unknown>, bookId: string) => ProgressRecord> = {
  1: readFormat1,
  // Format 2 (app 2.x, 2026-09-28 – the MAJOR was for the tracking engine, not for progress): same shape as 1
  2: readFormat1,
};

/** Same JSON value (key order ignored) */
const sameValue = (a: unknown, b: unknown): boolean => {
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => key in b && sameValue(a[key], b[key]));
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  return a === b;
};

/**
 * Every field the stored record had comes out of the reader as it was (only its format and defaults for
 * missing fields differ) – nothing was dropped or corrected, so the reader need not be told (Tilman,
 * 2026-09-28: a MAJOR that didn't change the progress shows no notice).
 */
const keptAsItWas = (raw: Record<string, unknown>, record: ProgressRecord): boolean =>
  Object.entries(raw).every(([key, value]) => key === "format" || sameValue(value, (record as unknown as Record<string, unknown>)[key]));

/**
 * Stored record → current record. `raw` null means nothing stored; anything else without a known
 * format (including one written by a newer app) is unreadable. An older format is "converted" only when
 * reading it changed something (`keptAsItWas`).
 */
export const readProgress = (raw: unknown, bookId: string): ProgressReadResult => {
  if (raw === null) return { record: createProgressRecord(bookId), status: "new" };
  const reader = isObject(raw) && isNumber(raw.format) ? PROGRESS_READERS[raw.format] : undefined;
  if (!isObject(raw) || !reader) return { record: createProgressRecord(bookId), status: "unreadable" };
  const record = reader(raw, bookId);
  return {
    record,
    status: raw.format === PROGRESS_FORMAT || keptAsItWas(raw, record) ? "current" : "converted",
  };
};

/** Earliest time per id from both sides */
const union = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const result = { ...b };
  for (const [id, time] of Object.entries(a)) result[id] = id in result ? Math.min(result[id], time) : time;
  return result;
};

/**
 * Merges two records of the same book (account sync): union of unlocked and consulted ids with the
 * earliest time, onboarded if either was; this device's last spread / category win, the other's fill gaps.
 */
export const mergeProgress = (local: ProgressRecord, other: ProgressRecord): ProgressRecord => ({
  ...local,
  format: PROGRESS_FORMAT,
  appVersions: [...other.appVersions, ...local.appVersions.filter(v => !other.appVersions.includes(v))],
  unlocked: union(local.unlocked, other.unlocked),
  consulted: union(local.consulted, other.consulted),
  lastSpreadId: local.lastSpreadId ?? other.lastSpreadId,
  lastCategory: local.lastCategory ?? other.lastCategory,
  onboarded: local.onboarded || other.onboarded,
});
