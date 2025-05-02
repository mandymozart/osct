import { EntityData } from "./entities";

/**
 * Track the history of seen targets
 */
export interface TargetHistoryEntry {
  chapterId: string;
  targetIndex: number;
  timestamp: number;
}

export interface TargetManagerState {
  trackedTargets: number[];
  activeTarget: string | null;
}

/**
 * Base data structure for a target without loading state
 */
export interface TargetData {
  id: string;
  mindarTargetIndex: number;
  bookId: string;
  title: string;
  description: string;
  entity: EntityData;
  imageTargetSrc: string;
  mindSrc: string;
  hideFromIndex?: boolean;
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