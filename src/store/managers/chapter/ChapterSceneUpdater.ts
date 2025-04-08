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

    console.log(`Updating scene with chapter: ${chapter.id}`);
    
    try {
      // Assert that the scene manager exists
      assert(this.game.scene, 'Scene manager is not initialized');
      
      // Clear existing scene elements
      this.game.scene.clearScene();
      
      // Process all targets and add them to the scene
      chapter.targets.forEach((target, index) => {
        // Skip targets without entities
        if (!target.entity) return;
        
        // Only add loaded targets to the scene
        if (target.status === LoadingState.LOADED) {
          this.game.scene.addTargetToScene(target, index);
        }
      });
      
      // Only add minimal logging for successful operations
      console.log('Scene updated with chapter content');
    } catch (error) {
      console.error('Error updating scene with chapter:', error);
      // Use standardized error notification
      this.game.notifyError({
        code: 'scene-update-failed',
        msg: `Failed to update scene with chapter ${chapter.id}`,
        details: error
      });
    }
  }
}
