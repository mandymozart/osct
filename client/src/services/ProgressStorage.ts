import type { IProgressStorage, ProgressRecord } from "@/types";

/**
 * Progress storage adapter backed by localStorage, one key per experience. Another store (DB/API) can replace
 * it with the same record shape (`IProgressStorage`).
 */
export class LocalProgressStorage implements IProgressStorage {
  static key(experienceId: string): string {
    return `osct-progress:${experienceId}`;
  }

  load(experienceId: string): unknown {
    try {
      const text = localStorage.getItem(LocalProgressStorage.key(experienceId));
      return text === null ? null : JSON.parse(text);
    } catch (error) {
      console.warn("[ProgressStorage] Failed to load progress:", error);
      return undefined; // corrupt: the progress reader treats it as unreadable
    }
  }

  save(record: ProgressRecord): void {
    try {
      localStorage.setItem(LocalProgressStorage.key(record.experienceId), JSON.stringify(record));
    } catch (error) {
      console.warn("[ProgressStorage] Failed to save progress:", error);
    }
  }
}
