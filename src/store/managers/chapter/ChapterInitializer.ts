import { produce } from "immer";
import { 
  ChapterData, 
  ChapterResource, 
  IGame, 
  LoadingState, 
  Target 
} from "../../../types";

/**
 * Responsible for initializing chapter resources and loading states
 */
export class ChapterInitializer {
  private game: IGame;
  
  constructor(game: IGame) {
    this.game = game;
  }

  /**
   * Initialize empty chapter structure in game state
   */
  initializeGameState(): void {
    // Only initialize if not already done
    if (!this.game.state.chapters) {
      this.game.set({
        chapters: {},
        currentChapter: null
      });
    }
  }
  
  /**
   * Create a properly initialized chapter resource with loading states
   */
  initializeChapter(chapterData: ChapterData): ChapterResource {
    // Create a default chapter structure
    const chapter: ChapterResource = {
      id: chapterData.id,
      src: chapterData.imageTargetSrc,
      status: LoadingState.INITIAL,
      error: null,
      targets: chapterData.targets.map(targetData => {
        return {
          ...targetData,
          status: LoadingState.INITIAL,
          error: null,
          entity: targetData.entity ? {
            ...targetData.entity,
            status: LoadingState.INITIAL,
            error: null,
            assets: targetData.entity.assets.map(asset => ({
              ...asset,
              status: LoadingState.INITIAL,
              error: null,
              src: asset.src,
            }))
          } : null
        } as Target;
      })
    };

    return chapter;
  }

  /**
   * Mark a chapter and all its resources as loading
   */
  markChapterAsLoading(chapter: ChapterResource): ChapterResource {
    // Use Immer to create a new immutable state with all resources marked as loading
    return produce(chapter, (draft) => {
      // Mark chapter as loading
      draft.status = LoadingState.LOADING;
      draft.error = null;

      // Mark all targets and their entities/assets as loading
      if (draft.targets) {
        for (let i = 0; i < draft.targets.length; i++) {
          const target = draft.targets[i];

          // Mark target as loading
          target.status = LoadingState.LOADING;
          target.error = null;

          // Mark entity as loading if it exists
          if (target.entity) {
            target.entity.status = LoadingState.LOADING;
            target.entity.error = null;
          }
        }
      }
    });
  }
}
