import type { EntryCategory } from "./game-config";
import type { ListCategory } from "./entries";

/**
 * What one reader discovered in one book, keyed by stable content ids and stored per `book.id` via
 * `IProgressStorage`. Ids no longer in the content are kept (listed as missing in the debug overlay).
 */
/** A book variable's value (the plugins' `book` scope): a JSON scalar */
export type ProgressVariable = string | number | boolean;

export interface ProgressRecord {
  /** Storage format = app MAJOR that wrote the record; an older format is read and converted */
  format: number;
  bookId: string;
  /** App versions that wrote this record, oldest first */
  appVersions: string[];
  /** Stage 1: target found in scan mode (target id → time) */
  unlocked: Record<string, number>;
  /** Stage 2: entry opened (entry id → time) */
  consulted: Record<string, number>;
  /** Last active scene (its id); restored as the active scene on the next start – since content schema 3.0 (#319) */
  lastScene: string | null;
  /** Last list shown – a category, or All (#286) – the "Marginalia" button goes back to it. "all" is additive within
   *  format 1: an older app reads it as none */
  lastCategory: ListCategory | null;
  /** Onboarding finished or skipped; until then the app starts with the onboarding */
  onboarded: boolean;
  /** The coach marks over the first scan (page scroller, icon – #282) were seen; reset when the onboarding ends
   *  again (replayed from Info). Additive within format 1: an older app drops it, a record without it shows them */
  coached: boolean;
  /** The book's variables set by its plugins (the `book` scope of the plugin API) – additive within format 1 */
  variables: Record<string, ProgressVariable>;
}

export interface HistoryManagerState {
  progress: ProgressRecord;
}

/**
 * Storage adapter for the progress record (currently localStorage). Returns raw data; parsing and
 * format conversion are the manager's job.
 */
export interface IProgressStorage {
  /** Raw stored record: null = nothing stored, undefined = unreadable */
  load(bookId: string): unknown;
  save(record: ProgressRecord): void;
}

/** Owns the reader's progress: unlocked targets, consulted entries, last spread / category, onboarding. */
export interface IHistoryManager {
  /** Load the progress record from storage, converting older formats. Runs at startup. */
  load(): void;

  /** Notify the reader once at startup if stored progress was converted (parts may be lost) or reset */
  reportLoadStatus(): void;

  /**
   * Take over a record from the reader's account (AccountService): `merge` joins it with this device's
   * progress, `replace` uses it instead. Saved on this device. Returns false (nothing changed) when the
   * record cannot be read.
   */
  applyStoredRecord(raw: unknown, mode: "merge" | "replace"): boolean;

  /** Stage 1: a target was found in scan mode */
  unlockTarget(targetId: string): void;
  isUnlocked(targetId: string): boolean;
  /** Unlocked target ids of a spread (only targets in the content) */
  getUnlockedTargets(spreadId: string): string[];

  /** Stage 2: an entry was opened */
  consultEntry(entryId: string): void;
  isConsulted(entryId: string): boolean;
  /** Consulted entries that are in the content (header counter: consulted / total); with a category, only its own –
   *  the counter under the Marginalia menu (#286) */
  getConsultedCount(category?: EntryCategory): number;

  setLastCategory(category: ListCategory): void;

  /** The reader finished or skipped the onboarding */
  setOnboarded(): void;

  /** The reader saw the scan view's coach marks (`true`), or should see them on the next scan (`false`, #282) */
  setCoached(coached: boolean): void;

  /** A book variable of the plugins' `book` scope (persisted with the progress) */
  getVariable(name: string): ProgressVariable | undefined;
  /** Set a book variable; `null` deletes it */
  setVariable(name: string, value: ProgressVariable | null): void;
  getVariables(): Record<string, ProgressVariable>;

  /** Stored ids that are no longer in the content (kept in storage, shown in the debug overlay) */
  getMissingIds(): { targets: string[]; entries: string[] };

  /** Percentage of unlocked targets in a spread */
  getSpreadCompletionPercentage(spreadId: string): number;

  isSpreadComplete(spreadId: string): boolean;

  /** Reset all progress for this book */
  reset(): void;
}
