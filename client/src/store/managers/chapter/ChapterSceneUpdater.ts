import { ChapterResource, IGame, LoadingState } from "../../../types";
import { assert } from "../../../utils/assert";

/**
 * Responsible for updating the scene with chapter content
 */
export class ChapterSceneUpdater {
  private game: IGame;
  
  constructor(game: IGame) {
    this.game = game;
  }

  /**
   * Update the A-Frame scene with the current chapter
   * This method connects chapter data to the 3D scene
   */
  updateScene(chapter: ChapterResource | null): void {
    if (!chapter || chapter.status !== LoadingState.LOADED) {
      console.warn('Cannot update scene: chapter not available or not loaded');
      return;
    }

    try {
      assert(this.game.scene, 'Scene manager is not initialized');
      this.game.scene.clearScene();
      chapter.targets.forEach((target, index) => {
        if (!target.entity) return;
        if (target.status === LoadingState.LOADED) {
          this.game.scene.addTargetToScene(target, index);
        }
      });
    } catch (error) {
      console.error('Error updating scene with chapter:', error);
      this.game.notifyError({
        code: 'scene-update-failed',
        msg: `Failed to update scene with chapter ${chapter.id}`,
        details: error
      });
    }
  }
}
