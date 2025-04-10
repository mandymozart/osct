import { ConfigurationVersion, TargetHistoryEntry } from "@/types/game";

/**
 * History Manager State
 */
export interface HistoryManagerState {
  history: TargetHistoryEntry[];
  configVersion: ConfigurationVersion | null;
}

/**
 * History Manager Interface
 */
export interface IHistoryManager {
  /**
   * Load target history from local storage
   */
  load(): void;

  /**
   * Mark a target as seen by the user
   * @param chapterId The chapter containing the target
   * @param targetIndex The index of the target
   */
  markTargetAsSeen(chapterId: string, targetIndex: number): void;

  /**
   * Check if a target has been seen before
   * @param chapterId The chapter containing the target
   * @param targetIndex The index of the target
   */
  hasTargetBeenSeen(chapterId: string, targetIndex: number): boolean;

  /**
   * Get all target indices that have been seen in a specific chapter
   * @param chapterId The chapter ID to check
   */
  getSeenTargetsForChapter(chapterId: string): number[];

  /**
   * Calculate the percentage of targets seen in a chapter
   * @param chapterId The chapter ID to calculate completion for
   */
  getChapterCompletionPercentage(chapterId: string): number;

  /**
   * Check if all targets in a chapter have been seen
   * @param chapterId The chapter ID to check
   */
  isChapterComplete(chapterId: string): boolean;

  /**
   * Reset seen history for a specific chapter
   * @param chapterId The chapter ID to reset
   */
  resetChapterHistory(chapterId: string): void;

  /**
   * Reset all target history
   */
  reset(): void;
}