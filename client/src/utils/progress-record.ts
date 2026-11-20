import { ALL_CATEGORY, type ProgressRecord, type ProgressVariable } from "@/types";
import { isEntryCategory, isObject } from "@shared/guards/game-config";
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

export const createProgressRecord = (experienceId: string): ProgressRecord => ({
  format: PROGRESS_FORMAT,
  experienceId,
  appVersions: [],
  unlocked: {},
  consulted: {},
  lastScene: null,
  lastCategory: null,
  onboarded: false,
  coached: false,
  variables: {},
});

const pick = <T>(value: unknown, isValue: (v: unknown) => v is T): Record<string, T> =>
  isObject(value)
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, T] => isValue(entry[1])))
    : {};

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isVariable = (v: unknown): v is ProgressVariable => isString(v) || isNumber(v) || typeof v === "boolean";

/**
 * Formats 1 to 4: the record as defined in `types/history.ts`; malformed and unknown fields are dropped. Format 2 (app
 * 2.0.0, #319) has format 1's shape – only `lastSpreadId` became `lastScene`, read as dropped; format 3 (app 3.0.0,
 * #320) – only `bookId` became `experienceId`: the id comes from the caller, so an older record's `bookId` is not read; format 4 (app 4.0.0, #334, content schema 5.0) has format 3's shape.
 */
const readRecord = (raw: Record<string, unknown>, experienceId: string): ProgressRecord => ({
  ...createProgressRecord(experienceId),
  appVersions: Array.isArray(raw.appVersions) ? raw.appVersions.filter(isString) : [],
  unlocked: pick(raw.unlocked, isNumber),
  consulted: pick(raw.consulted, isNumber),
  // `lastScene` since content schema 3.0 (#319) – an older `lastSpreadId` is dropped, not converted
  lastScene: isString(raw.lastScene) ? raw.lastScene : null,
  lastCategory: isEntryCategory(raw.lastCategory) || raw.lastCategory === ALL_CATEGORY ? raw.lastCategory : null,
  // Additive field within format 1: records without it count as not onboarded
  onboarded: raw.onboarded === true,
  // Additive field within format 1 (#282): records without it show the scan view's coach marks once
  coached: raw.coached === true,
  // Additive field within format 1: the plugins' experience variables, scalars only
  variables: pick(raw.variables, isVariable),
});

/** One reader per storage format, each returns the current shape */
export const PROGRESS_READERS: Record<number, (raw: Record<string, unknown>, experienceId: string) => ProgressRecord> = {
  1: readRecord,
  2: readRecord,
  3: readRecord,
  4: readRecord,
};

/** Fields an older format named differently: the old name → the current one (its value kept as it was) */
const RENAMED_FIELDS: Record<string, keyof ProgressRecord> = { bookId: "experienceId" };

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
 * missing fields differ) – nothing was dropped or corrected, so the reader need not be told:
 * a new format that did not change their progress shows no notice.
 */
const keptAsItWas = (raw: Record<string, unknown>, record: ProgressRecord): boolean => {
  const fields: Record<string, unknown> = { ...record };
  return Object.entries(raw).every(([key, value]) => key === "format" || sameValue(value, fields[RENAMED_FIELDS[key] ?? key]));
};

/**
 * Stored record → current record. `raw` null means nothing stored; anything else without a known
 * format (including one written by a newer app) is unreadable. An older format is "converted" only when
 * reading it changed something (`keptAsItWas`).
 */
export const readProgress = (raw: unknown, experienceId: string): ProgressReadResult => {
  if (raw === null) return { record: createProgressRecord(experienceId), status: "new" };
  // A record of a newer app is unreadable, even when a reader for its format is ready for the next MAJOR
  const reader = isObject(raw) && isNumber(raw.format) && raw.format <= PROGRESS_FORMAT ? PROGRESS_READERS[raw.format] : undefined;
  if (!isObject(raw) || !reader) return { record: createProgressRecord(experienceId), status: "unreadable" };
  const record = reader(raw, experienceId);
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
 * Merges two records of the same experience (account sync): union of unlocked and consulted ids with the
 * earliest time, onboarded (and coached) if either was; this device's last scene / category and variables win, the other's fill
 * gaps.
 */
export const mergeProgress = (local: ProgressRecord, other: ProgressRecord): ProgressRecord => ({
  ...local,
  format: PROGRESS_FORMAT,
  appVersions: [...other.appVersions, ...local.appVersions.filter(v => !other.appVersions.includes(v))],
  unlocked: union(local.unlocked, other.unlocked),
  consulted: union(local.consulted, other.consulted),
  lastScene: local.lastScene ?? other.lastScene,
  lastCategory: local.lastCategory ?? other.lastCategory,
  onboarded: local.onboarded || other.onboarded,
  coached: local.coached || other.coached,
  variables: { ...other.variables, ...local.variables },
});
