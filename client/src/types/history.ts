import { EntryCategory } from "./entries";

/**
 * What one reader discovered in one book, keyed by stable content ids and stored per `book.id` via
 * `IProgressStorage`. Ids no longer in the content are kept (listed as missing in the debug overlay).
 */
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
  /** Last active spread; restored as the active spread on the next start */
  lastSpreadId: string | null;
  /** Last selected entries category ("Entries" button) */
  lastCategory: EntryCategory | null;
  /** Onboarding finished or skipped; until then the app starts with the onboarding */
  onboarded: boolean;
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
  /** Consulted entries that are in the content (header counter: consulted / total) */
  getConsultedCount(): number;

  setLastCategory(category: EntryCategory): void;

  /** The reader finished or skipped the onboarding */
  setOnboarded(): void;

  /** Stored ids that are no longer in the content (kept in storage, shown in the debug overlay) */
  getMissingIds(): { targets: string[]; entries: string[] };

  /** Percentage of unlocked targets in a spread */
  getSpreadCompletionPercentage(spreadId: string): number;

  isSpreadComplete(spreadId: string): boolean;

  /** Reset all progress for this book */
  reset(): void;
}
