export interface TargetManagerState {
  trackedTargets: string[]; // target ids
}

export interface ITargetManager {
  /** Mark a found target as tracked and unlock it in the progress */
  addTarget(targetId: string): void;

  removeTarget(targetId: string): void;

  getTrackedTargets(): string[];
}