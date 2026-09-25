import { EntryCategory } from "@/types";

/**
 * Progress record: what one reader discovered in one book, keyed by stable ids (PLAN Phase 2).
 * Stored per book (`book.id`) behind a storage adapter (`IProgressStorage`).
 * Ids that are no longer in the content are kept (shown as missing in the debug overlay).
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
  /** Bookmarked entries (entry id → time) – UI in Phase 4 */
  marked: Record<string, number>;
  /** Short user note per entry (entry id → text) – UI in Phase 4 */
  notes: Record<string, string>;
  /** Last active spread (resume) */
  lastSpreadId: string | null;
  /** Last selected entries category ("Entries" button, Phase 4) */
  lastCategory: EntryCategory | null;
}

/**
 * History Manager State
 */
export interface HistoryManagerState {
  progress: ProgressRecord;
}

/**
 * Storage adapter for the progress record: localStorage now, a DB/API store later.
 * Returns raw data – reading and converting formats is the manager's job.
 */
export interface IProgressStorage {
  /** Raw stored record: null = nothing stored, undefined = unreadable */
  load(bookId: string): unknown;
  save(record: ProgressRecord): void;
}

/**
 * History Manager Interface: progress of the reader (unlocked targets, consulted entries,
 * bookmarks, notes, last spread / category).
 */
export interface IHistoryManager {
  /**
   * Load the progress record from storage (converts older formats). Runs at startup.
   */
  load(): void;

  /**
   * Offer to resume the last spread; also tells the user when the progress was converted.
   */
  offerResume(): void;

  /** Stage 1: a target was found in scan mode */
  unlockTarget(targetId: string): void;
  isUnlocked(targetId: string): boolean;
  /** Unlocked target ids of a spread (only targets in the content) */
  getUnlockedTargets(spreadId: string): string[];

  /** Stage 2: an entry was opened */
  consultEntry(entryId: string): void;
  isConsulted(entryId: string): boolean;

  setMarked(entryId: string, marked: boolean): void;
  isMarked(entryId: string): boolean;
  /** Empty text removes the note */
  setNote(entryId: string, note: string): void;
  getNote(entryId: string): string;

  setLastCategory(category: EntryCategory): void;

  /**
   * Stored ids that are no longer in the content (kept in storage, shown in the debug overlay)
   */
  getMissingIds(): { targets: string[]; entries: string[] };

  /**
   * Percentage of unlocked targets in a spread
   */
  getSpreadCompletionPercentage(spreadId: string): number;

  /**
   * Check if all targets in a spread have been unlocked
   */
  isSpreadComplete(spreadId: string): boolean;

  /**
   * Reset the whole progress of this book
   */
  reset(): void;
}
