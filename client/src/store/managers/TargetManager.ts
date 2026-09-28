import { IGame, ITargetManager } from "@/types";
import { getTarget } from "@/utils/game-config";
import { feedback } from "@/services/FeedbackService";

/**
 * Targets currently tracked by the AR engine (`trackedTargets`). Tracking a content target
 * unlocks it in the reader's progress (first discovery stage).
 */
export class TargetManager implements ITargetManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
  }

  public addTarget(targetId: string): void {
    const isTargetTracked = this.game.state.trackedTargets.includes(targetId);

    if (!isTargetTracked) {
      this.game.update(draft => {
        draft.trackedTargets.push(targetId);
      });

      // Only content targets unlock. First find plays the unlock jingle, later finds a short
      // "found" cue (FeedbackService throttles it per target)
      if (getTarget(targetId)) {
        const isNew = !this.game.history.isUnlocked(targetId);
        this.game.history.unlockTarget(targetId);
        feedback(isNew ? "unlock" : "found", targetId);
      }
    }
  }

  public removeTarget(targetId: string): void {
    this.game.update(draft => {
      const index = draft.trackedTargets.indexOf(targetId);
      if (index !== -1) {
        draft.trackedTargets.splice(index, 1);
      }
    });
  }

  public getTrackedTargets(): string[] {
    return this.game.state.trackedTargets;
  }
}
