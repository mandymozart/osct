import { Target } from './../';

export interface TargetManagerState {
  trackedTargets: number[];
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