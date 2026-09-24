import { IGame, ITargetManager } from "../../types";
import { getTarget } from "@/utils/game-config";

/**
 * Manages target tracking during gameplay
 */
export class TargetManager implements ITargetManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
  }

  /**
   * Add a target to the list of tracked targets and mark it as seen
   */
  public addTarget(targetId: string): void {
    const isTargetTracked = this.game.state.trackedTargets.includes(targetId);

    if (!isTargetTracked) {
      // Use the update method which internally uses immer
      this.game.update(draft => {
        draft.trackedTargets.push(targetId);
      });

      // History is still keyed by spread + MindAR index until the Phase 2 rekey (decision b)
      const target = getTarget(targetId);
      if (target) {
        this.game.history.markTargetAsSeen(target.spreadId, target.index);
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
