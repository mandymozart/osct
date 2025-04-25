import { IGame, ITargetManager } from "../../types";

/**
 * Manages target tracking during gameplay
 */
export class TargetManager implements ITargetManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
  }

  /**
   * Add a target index to the list of tracked targets
   */
  public addTarget(targetIndex: number): void {
    const isTargetTracked = this.game.state.trackedTargets.includes(targetIndex);

    if (!isTargetTracked) {
      // Use the update method which internally uses immer
      this.game.update(draft => {
        draft.trackedTargets.push(targetIndex);
      });

      // Mark this target as seen if we have a current chapter
      if (this.game.state.currentChapter) {
        this.game.history.markTargetAsSeen(
          this.game.state.currentChapter,
          targetIndex
        );
      }
    }
  }

  /**
   * Remove a target from the list of tracked targets
   */
  public removeTarget(targetIndex: number): void {
    // Use the update method which internally uses immer
    this.game.update(draft => {
      const index = draft.trackedTargets.indexOf(targetIndex);
      if (index !== -1) {
        draft.trackedTargets.splice(index, 1);
      }
    });
  }

  /**
   * Get the list of currently tracked target indices
   */
  public getTrackedTargets(): number[] {
    return this.game.state.trackedTargets;
  }
}
