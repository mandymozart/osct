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

/** Format 1 (app 1.x): the record as defined in `types/history.ts`; malformed and unknown fields are dropped. */
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
};

/**
 * Stored record → current record. `raw` null means nothing stored; anything else without a known
 * format (including one written by a newer app) is unreadable.
 */
export const readProgress = (raw: unknown, bookId: string): ProgressReadResult => {
  if (raw === null) return { record: createProgressRecord(bookId), status: "new" };
  const reader = isObject(raw) && isNumber(raw.format) ? PROGRESS_READERS[raw.format] : undefined;
  if (!isObject(raw) || !reader) return { record: createProgressRecord(bookId), status: "unreadable" };
  return {
    record: reader(raw, bookId),
    status: raw.format === PROGRESS_FORMAT ? "current" : "converted",
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
