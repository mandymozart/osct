import { EntityData } from "./entities";

/**
 * Track the history of seen targets
 */
export interface TargetHistoryEntry {
  spreadId: string;
  targetIndex: number;
  timestamp: number;
}

export interface TargetManagerState {
  trackedTargets: number[];
}

/**
 * Base data structure for a target without loading state
 */
export interface TargetData {
  id: string;
  mindarTargetIndex: number;
  bookId: string;
  entryId: string;
  // Copied from the entry by the content build until the index is rebuilt around entries (Phase 5)
  title: string;
  description: string;
  hideFromIndex: boolean;
  entity: EntityData;
  imageTargetSrc: string;
  mindSrc: string;
  tags?: string[];
  relatedTargets?: string[];
}

export interface ITargetManager {
  /**
   * Add a target index to the list of tracked targets
   * @param targetIndex The index of the target to track
   */
  addTarget(targetIndex: number): void;

  /**
   * Remove a target from the list of tracked targets
   * @param targetIndex The index of the target to remove
   */
  removeTarget(targetIndex: number): void;

  /**
   * Get the list of currently tracked target indices
   * @returns Array of tracked target indices
   */
  getTrackedTargets(): number[];
}