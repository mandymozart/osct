import { IProgressStorage, ProgressRecord } from "@/types";

/**
 * Progress storage in localStorage, one key per book. A DB/API store can replace it later with the
 * same record shape (RULES #17: storage adapter as a service).
 */
export class LocalProgressStorage implements IProgressStorage {
  static key(bookId: string): string {
    return `osct-progress:${bookId}`;
  }

  load(bookId: string): unknown {
    try {
      const text = localStorage.getItem(LocalProgressStorage.key(bookId));
      return text === null ? null : JSON.parse(text);
    } catch (error) {
      console.warn("[ProgressStorage] Failed to load progress:", error);
      return undefined; // corrupt – the reader treats it as unreadable
    }
  }

  save(record: ProgressRecord): void {
    try {
      localStorage.setItem(LocalProgressStorage.key(record.bookId), JSON.stringify(record));
    } catch (error) {
      console.warn("[ProgressStorage] Failed to save progress:", error);
    }
  }
}
