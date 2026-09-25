import { EntityData, TargetData } from "./game-config";

export interface TargetManagerState {
  trackedTargets: string[]; // target ids
}

/**
 * App model of a target (mapped from `TargetData` by `utils/game-config.ts`).
 * `index` is the MindAR targetIndex within the spread; the entity ref is resolved.
 */
export interface Target extends Omit<TargetData, "entity"> {
  entryId: string;
  spreadId: string;
  entity?: EntityData;
}

export interface ITargetManager {
  /**
   * Add a target to the list of tracked targets (and unlock it in the progress)
   * @param targetId The id of the found target
   */
  addTarget(targetId: string): void;

  /**
   * Remove a target from the list of tracked targets
   * @param targetId The id of the lost target
   */
  removeTarget(targetId: string): void;

  /**
   * Get the ids of the currently tracked targets
   */
  getTrackedTargets(): string[];
}