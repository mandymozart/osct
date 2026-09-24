import { ConfigurationVersion, TargetHistoryEntry } from "@/types";

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
   * @param spreadId The spread containing the target
   * @param targetIndex The index of the target
   */
  markTargetAsSeen(spreadId: string, targetIndex: number): void;

  /**
   * Check if a target has been seen before
   * @param spreadId The spread containing the target
   * @param targetIndex The index of the target
   */
  hasTargetBeenSeen(spreadId: string, targetIndex: number): boolean;

  /**
   * Get all target indices that have been seen in a specific spread
   * @param spreadId The spread ID to check
   */
  getSeenTargetsForSpread(spreadId: string): number[];

  /**
   * Calculate the percentage of targets seen in a spread
   * @param spreadId The spread ID to calculate completion for
   */
  getSpreadCompletionPercentage(spreadId: string): number;

  /**
   * Check if all targets in a spread have been seen
   * @param spreadId The spread ID to check
   */
  isSpreadComplete(spreadId: string): boolean;

  /**
   * Reset seen history for a specific spread
   * @param spreadId The spread ID to reset
   */
  resetSpreadHistory(spreadId: string): void;

  /**
   * Reset all target history
   */
  reset(): void;
}