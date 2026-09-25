import { ProgressRecord } from "@/types";
import { isEntryCategory } from "@shared/guards/game-config";
import { parseVersion } from "./version";

/**
 * Reading stored progress (PLAN Phase 2, RULES #10): the storage format is the app MAJOR that
 * wrote the record. A new MAJOR keeps one reader per older format that converts it to the
 * current shape – no generic migration framework. The first format is 1 (app 1.x); storage from
 * before (numeric `ar-game-*` keys) is not converted – the app was never deployed publicly.
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

/**
 * Format 1 (app 1.x): the record as defined in `types/history.ts`; drops malformed and unknown fields
 * (e.g. `marked` / `notes` from before bookmarks and notes were removed, 2026-09-25).
 */
const readFormat1 = (raw: Record<string, unknown>, bookId: string): ProgressRecord => ({
  ...createProgressRecord(bookId),
  appVersions: Array.isArray(raw.appVersions) ? raw.appVersions.filter(isString) : [],
  unlocked: pick(raw.unlocked, isNumber),
  consulted: pick(raw.consulted, isNumber),
  lastSpreadId: isString(raw.lastSpreadId) ? raw.lastSpreadId : null,
  lastCategory: isEntryCategory(raw.lastCategory) ? raw.lastCategory : null,
  // Added 2026-09-25 (additive, same format): records without it count as not onboarded
  onboarded: raw.onboarded === true,
});

/** One reader per storage format, each returns the current shape */
export const PROGRESS_READERS: Record<number, (raw: Record<string, unknown>, bookId: string) => ProgressRecord> = {
  1: readFormat1,
};

/**
 * Stored record → current record. `raw` null = nothing stored, undefined/garbage = unreadable
 * (also a format this app does not know, e.g. written by a newer app).
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
