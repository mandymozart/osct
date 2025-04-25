import { AssetType } from "./assets";
import { EntityData } from "./entities";


/**
 * Represents a tracking target in AR with loading state
 * Tightly connected to Entities in our setup. so proper typing is crucial
 * @deprecated redundant interface with optional id, string id is fine */
export interface Target {
  id?: string;
}

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
}

/**
 * Base data structure for a target without loading state
 */
export interface TargetData {
  type: AssetType
  id: string;
  mindarTargetIndex: number;
  bookId: string;
  title: string;
  description: string;
  entity: EntityData;
  imageTargetSrc: string;
  mindSrc: string;
  tags: string[];
  relatedTargets: string[];
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

  /**
   * Get targets from current chapter that are currently tracked
   * @returns Array of tracked Target objects from current chapter
   */
  getTrackedTargetObjects(): Target[];
}