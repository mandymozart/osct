import { IGame, ITargetManager } from "@/types";
import { getTarget } from "@/utils/game-config";
import { feedback } from "@/services/FeedbackService";

/**
 * Manages target tracking during gameplay
 */
export class TargetManager implements ITargetManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
  }

  /**
   * Add a target to the list of tracked targets and unlock it
   */
  public addTarget(targetId: string): void {
    const isTargetTracked = this.game.state.trackedTargets.includes(targetId);

    if (!isTargetTracked) {
      // Use the update method which internally uses immer
      this.game.update(draft => {
        draft.trackedTargets.push(targetId);
      });

      // Stage 1 of discovery: found in scan mode = unlocked (only targets of the content).
      // First find: the unlock jingle; later finds: a short "found" (once per target every few seconds)
      if (getTarget(targetId)) {
        const isNew = !this.game.history.isUnlocked(targetId);
        this.game.history.unlockTarget(targetId);
        feedback(isNew ? "unlock" : "found", targetId);
      }
    }
  }

  /**
   * Remove a target from the list of tracked targets
   */
  public removeTarget(targetId: string): void {
    // Use the update method which internally uses immer
    this.game.update(draft => {
      const index = draft.trackedTargets.indexOf(targetId);
      if (index !== -1) {
        draft.trackedTargets.splice(index, 1);
      }
    });
  }

  /**
   * Get the ids of the currently tracked targets
   */
  public getTrackedTargets(): string[] {
    return this.game.state.trackedTargets;
  }
}
