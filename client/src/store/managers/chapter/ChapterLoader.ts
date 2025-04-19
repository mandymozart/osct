import { produce } from "immer";
import {
  ChapterResource,
  ErrorCode,
  IGame,
  LoadingState,
} from "../../../types";

/**
 * Responsible for loading chapter resources and handling loading errors
 */
export class ChapterLoader {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
  }

  /**
   * Load all resources for a chapter
   * @returns Promise that resolves when all resources are loaded
   */
  async loadChapterResources(
    chapter: ChapterResource
  ): Promise<ChapterResource> {
    const allErrors: any[] = [];
    let workingChapter = chapter;
    for (let i = 0; i < workingChapter.targets.length; i++) {
      const target = workingChapter.targets[i];

      try {
        if (target.entity) {
          if (target.entity.assets && target.entity.assets.length > 0) {
            try {
              const loadedAssets = await this.game.loadAssets(
                target.entity.assets
              );

              const failedAssets = loadedAssets.filter(
                (asset) => asset.status === LoadingState.ERROR
              );

              workingChapter = produce(
                workingChapter,
                (draft: ChapterResource) => {
                  if (failedAssets.length > 0) {
                    // Some assets failed - mark entity as failed
                    draft.targets[i].entity.status = LoadingState.ERROR;
                    draft.targets[i].entity.error = {
                      code: ErrorCode.SOME_ASSETS_NOT_FOUND,
                      msg: `Failed to load ${failedAssets.length} assets`,
                      details: failedAssets.map((a) => a.error),
                    };

                    // Also mark target as failed since its entity failed
                    draft.targets[i].status = LoadingState.ERROR;
                    draft.targets[i].error = {
                      code: ErrorCode.SOME_ASSETS_NOT_FOUND,
                      msg: `Entity failed to load due to asset errors`,
                      details: failedAssets.map((a) => a.error),
                    };

                    // Store the updated assets even if some failed
                    draft.targets[i].entity.assets = loadedAssets;

                    // Add error details to the collection
                    allErrors.push(...failedAssets.map((a) => a.error));
                  } else {
                    // All assets loaded successfully
                    draft.targets[i].entity.status = LoadingState.LOADED;
                    draft.targets[i].entity.error = null;

                    // Mark target as loaded since its entity loaded
                    draft.targets[i].status = LoadingState.LOADED;
                    draft.targets[i].error = null;

                    // Store the successfully loaded assets
                    draft.targets[i].entity.assets = loadedAssets;
                  }
                }
              );
            } catch (error) {
              console.error(
                `Error loading assets for entity in target ${i}:`,
                error
              );

              const errorMsg =
                error instanceof Error
                  ? error.message
                  : "Unknown error loading entity assets";

              // Update entity and target states
              workingChapter = produce(
                workingChapter,
                (draft: ChapterResource) => {
                  // Mark entity as failed
                  draft.targets[i].entity.status = LoadingState.ERROR;
                  draft.targets[i].entity.error = {
                    code: ErrorCode.ASSET_LOAD_FAILED,
                    msg: errorMsg,
                  };

                  // Also mark target as failed
                  draft.targets[i].status = LoadingState.ERROR;
                  draft.targets[i].error = {
                    code: ErrorCode.ASSET_LOAD_FAILED,
                    msg: "Entity failed to load assets",
                  };
                }
              );

              // Add to global errors collection
              allErrors.push(error);
            }
          } else {
            // No assets to load, mark entity as loaded
            workingChapter = produce(
              workingChapter,
              (draft: ChapterResource) => {
                draft.targets[i].entity.status = LoadingState.LOADED;
                draft.targets[i].entity.error = null;

                // Mark target as loaded
                draft.targets[i].status = LoadingState.LOADED;
                draft.targets[i].error = null;
              }
            );
          }
        } else {
          // No entity, mark target as loaded
          workingChapter = produce(workingChapter, (draft: ChapterResource) => {
            draft.targets[i].status = LoadingState.LOADED;
            draft.targets[i].error = null;
          });
        }
      } catch (error) {
        console.error(`Error processing target ${i}:`, error);
        allErrors.push(error);
      }
    }

    // Final chapter state update based on all targets
    workingChapter = produce(workingChapter, (draft: ChapterResource) => {
      if (allErrors.length > 0) {
        // If any targets/entities/assets failed, mark chapter as failed
        draft.status = LoadingState.ERROR;
        draft.error = {
          code: ErrorCode.CHAPTER_LOAD_FAILED,
          msg: `Chapter failed to load with ${allErrors.length} errors`,
          details: allErrors, // Store all errors for debugging
        };
      } else {
        // All targets loaded successfully
        draft.status = LoadingState.LOADED;
        draft.error = null;
      }
    });

    return workingChapter;
  }
}
