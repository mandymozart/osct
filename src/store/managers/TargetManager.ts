import { produce } from "immer";
import { IGame, Target, ITargetManager } from "../../types";
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
    const isTargetTracked =
      this.game.state.trackedTargets.includes(targetIndex);

    if (!isTargetTracked) {
      // Use Immer to update tracked targets
      this.game.state = produce(
        this.game.state,
        (draft: { trackedTargets: number[] }) => {
          draft.trackedTargets.push(targetIndex);
        }
      );

      // Mark this target as seen if we have a current chapter
      // TODO: check if accessing the history from here is smart
      if (this.game.state.currentChapter) {
        this.game.history.markTargetAsSeen(
          this.game.state.currentChapter.id,
          targetIndex
        );
      }

      // Notify listeners of the change
      this.game.notifyListeners();
    }
  }

  /**
   * Remove a target from the list of tracked targets
   */
  public removeTarget(targetIndex: number): void {
    // Use Immer to update tracked targets
    this.game.state = produce(
      this.game.state,
      (draft: { trackedTargets: number[] }) => {
        const index = draft.trackedTargets.indexOf(targetIndex);
        if (index !== -1) {
          draft.trackedTargets.splice(index, 1);
        }
      }
    );

    // Notify listeners of the change
    this.game.notifyListeners();
  }

  /**
   * Get the list of currently tracked target indices
   */
  public getTrackedTargets(): number[] {
    return this.game.state.trackedTargets;
  }

  /**
   * Get targets from current chapter that are currently tracked
   */
  public getTrackedTargetObjects(): Target[] {
    if (!this.game.state.currentChapter) return [];

    return this.game.state.trackedTargets
      .map((index: number) =>
        this.game.state.currentChapter?.targets.find(
          (t: Target) => t.mindarTargetIndex === index
        )
      )
      .filter((target: Target | undefined) => target !== undefined) as Target[];
  }
}
