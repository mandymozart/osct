import { produce } from "immer";
import {
  Asset,
  ErrorCode,
  IGame,
  ChapterResource,
  ChapterData,
  IChapterManager,
  LoadingState,
  Target,
} from "../../types";
import {
  chapters as chaptersData,
  initialChapterId,
} from "./../../game.config.json";

/**
 * Manages chapter loading, initialization, and caching
 */
export class ChapterManager implements IChapterManager {
  private game: IGame;
  private data: ChapterData[] = chaptersData as ChapterData[];

  constructor(game: IGame) {
    this.game = game;
    this.initialize();
  }

  /**
   * Initialize the game state with empty chapter resources
   * Maps static chapter data to mutable chapter resources in the game state
   * Sets the initial chapter
   * @returns void
   */
  public async initialize(): Promise<void> {
    console.log("[Chapter Manager] Initializing chapter manager");
    this.game.set({loading: LoadingState.LOADING});
    const chapters: Record<string, ChapterResource> = {};
    try {
      this.data.forEach((chapterData) => {
        const chapterResource = this.initializeChapterLoadingStates(chapterData);
        chapters[chapterData.id] = chapterResource;
      });
      this.game.set({ chapters });
      // TODO: No async waiting till all assets are loaded for initial chapter
      await this.switchChapter(initialChapterId);

    } catch (error) {
      console.error("[Chapter Manager] Failed to initialize chapter manager:", error);
    }

    this.game.set({loading: LoadingState.LOADED});
    this.game.notifyListeners();
  }

  /**
   * Get a cached chapter if available
   */
  public getCachedChapter(chapterId: string): ChapterResource | null {
    return this.game.state.chapters[chapterId] || null;
  }

  /**
   * Get chapter
   */
  public getCurrentChapter(): ChapterResource | null {
    return this.game.state.currentChapter;
  }

  /**
   * Switch to a different chapter
   * @returns Promise that resolves when chapter is fully loaded
   */
  public async switchChapter(chapterId: string): Promise<void> {
    console.log(`[Chapter Manager] Switching to chapter: ${chapterId}`);
    this.game.set({loading: LoadingState.LOADING}); 
    try {
      // Check if already on this chapter
      if (
        this.game.state.currentChapter?.id === chapterId &&
        this.game.state.currentChapter.status === LoadingState.LOADED
      ) {
        // Even if already on this chapter, ensure scene is updated
        this.updateSceneWithCurrentChapter();
        // Make sure to set loading state back to LOADED before returning
        this.game.set({loading: LoadingState.LOADED});
        return;
      }

      // Check cache first
      const cachedChapter = this.getCachedChapter(chapterId);
      if (cachedChapter && cachedChapter.status === LoadingState.LOADED) {
        this.game.set({ currentChapter: cachedChapter });

        // Update scene with cached chapter
        this.updateSceneWithCurrentChapter();
        // Also make sure to set loading state back to LOADED here
        this.game.set({loading: LoadingState.LOADED});
        return;
      }

      // Find the chapter in our data
      const chapterData = this.data.find((ch) => ch.id === chapterId);
      if (!chapterData) {
        const errorMsg = `Chapter ${chapterId} not found.`;
        this.handleChapterError(
          chapterId,
          ErrorCode.CHAPTER_NOT_FOUND,
          errorMsg
        );
        throw new Error(errorMsg);
      }

      // Initialize and start loading
      const newChapter = this.initializeChapterLoadingStates(chapterData);

      // Mark chapter as loading and update state
      const loadingChapter = {
        ...newChapter,
        loadingState: LoadingState.LOADING,
        error: null,
      };

      this.game.set({
        currentChapter: loadingChapter,
        trackedTargets: [],
      });

      // Load all chapter resources
      const loadedChapter = await this.loadChapterResources(loadingChapter);

      // Update cache with fully loaded chapter
      this.game.state = produce(this.game.state, (draft) => {
        draft.currentChapter = loadedChapter;
        draft.chapters[chapterId] = loadedChapter;
      });

      this.game.set({loading: LoadingState.LOADED});
      this.game.notifyListeners();

      // Update scene with newly loaded chapter
      this.updateSceneWithCurrentChapter();
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Failed to load chapter";
      this.handleChapterError(chapterId, ErrorCode.UNKNOWN_ERROR, errorMsg);
      throw error;
    }
  }

  /**
   * Handle chapter error with consistent error reporting
   */
  private handleChapterError(
    chapterId: string,
    errorCode: ErrorCode,
    errorMsg: string
  ): void {
    const failedChapter = {
      id: chapterId,
      status: LoadingState.ERROR,
      error: {
        code: errorCode,
        msg: errorMsg,
      },
    } as ChapterResource;

    this.game.set({
      currentChapter: failedChapter,
      trackedTargets: [],
    });

    this.game.notifyError({
      msg: errorMsg,
      code: errorCode,
    });
  }

  /**
   * Initialize loading states specifically for a chapter structure
   */
  private initializeChapterLoadingStates(
    chapterData: ChapterData
  ): ChapterResource {
    // Create deep clone of chapter to avoid modifying original data
    const chapter = JSON.parse(JSON.stringify(chapterData));

    // Use Immer for initialization
    return produce<ChapterResource>(chapter, (draft) => {
      // Initialize chapter's loading state
      draft.status = LoadingState.INITIAL;
      draft.error = null;

      // Initialize each target and its entity
      if (draft.targets) {
        draft.targets = draft.targets.map((target: Target) => {
          // Initialize target loading state
          target.status = LoadingState.INITIAL;
          target.error = null;

          // Initialize entity loading state
          if (target.entity) {
            target.entity.status = LoadingState.INITIAL;
            target.entity.error = null;

            // Initialize asset loading states
            if (target.entity.assets) {
              target.entity.assets = target.entity.assets.map(
                (asset: Asset) => ({
                  ...asset,
                  loadingState: LoadingState.INITIAL,
                  error: null,
                })
              );
            }
          }

          return target;
        });
      }
    });
  }

  /**
   * Load chapter and all its nested resources
   */
  private async loadChapterResources(
    chapter: ChapterResource
  ): Promise<ChapterResource> {
    try {
      let workingChapter = { ...chapter };

      const allErrors: {
        target: number;
        entity: boolean;
        asset: number;
        error: any;
      }[] = [];

      // Process each target
      if (workingChapter.targets) {
        for (let i = 0; i < workingChapter.targets.length; i++) {
          // Use Immer to update the working chapter
          workingChapter = produce(workingChapter, (draft: ChapterResource) => {
            const target = draft.targets[i];

            // Mark target as loading
            target.status = LoadingState.LOADING;
            target.error = null;

            // Mark entity as loading if it exists
            if (target.entity) {
              target.entity.status = LoadingState.LOADING;
              target.entity.error = null;
            }
          });

          // Update state to show progress
          this.game.set({ currentChapter: workingChapter });

          const target = workingChapter.targets[i];

          if (target.entity) {
            // Mark entity as loading
            const entity = target.entity;

            // Process assets if they exist
            if (entity.assets && entity.assets.length > 0) {
              try {
                const loadedAssets = await this.game.loadAssets<Asset>(
                  entity.assets
                );

                // Check if any assets failed to load
                const failedAssets = loadedAssets.filter(
                  (asset) => asset.status === LoadingState.ERROR
                );

                // Debug any failed assets and their errors
                if (failedAssets.length > 0) {
                  // Add errors to collection
                  failedAssets.forEach((asset, assetIndex) => {
                    allErrors.push({
                      target: i,
                      entity: true,
                      asset: assetIndex,
                      error: asset.error,
                    });
                  });
                }

                // Update with loaded assets using Immer
                workingChapter = produce(
                  workingChapter,
                  (draft: ChapterResource) => {
                    if (failedAssets.length > 0) {
                      // Some assets failed - mark entity as failed
                      draft.targets[i].entity.status = LoadingState.ERROR;
                      draft.targets[i].entity.error = {
                        code: ErrorCode.SOME_ASSETS_NOT_FOUND,
                        msg: `Failed to load ${failedAssets.length} assets`,
                      };

                      // Also mark target as failed since its entity failed
                      draft.targets[i].status = LoadingState.ERROR;
                      draft.targets[i].error = {
                        code: ErrorCode.SOME_ASSETS_NOT_FOUND,
                        msg: `Entity failed to load due to asset errors`,
                      };

                      // Store all assets (both successful and failed)
                      draft.targets[i].entity.assets = loadedAssets;
                    } else {
                      // All assets loaded successfully
                      draft.targets[i].entity.status = LoadingState.LOADED;
                      draft.targets[i].entity.error = null;

                      // Mark target as loaded since its entity loaded
                      draft.targets[i].status = LoadingState.LOADED;
                      draft.targets[i].error = null;

                      draft.targets[i].entity.assets = loadedAssets;
                    }
                  }
                );
              } catch (error) {
                // Handle errors in asset loading
                const errorMsg =
                  error instanceof Error
                    ? error.message
                    : "Unknown error loading assets";

                // Add to error collection
                allErrors.push({
                  target: i,
                  entity: true,
                  asset: -1, // -1 indicates a general entity asset loading error
                  error: {
                    code: ErrorCode.ASSET_LOAD_FAILED,
                    msg: errorMsg,
                  },
                });

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
            workingChapter = produce(
              workingChapter,
              (draft: ChapterResource) => {
                draft.targets[i].status = LoadingState.LOADED;
                draft.targets[i].error = null;
              }
            );
          }
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
    } catch (error) {
      // Handle any unexpected errors in the loading process
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Unknown error loading chapter";

      // Create error chapter
      const errorChapter = produce(chapter, (draft: ChapterResource) => {
        draft.status = LoadingState.ERROR;
        draft.error = {
          code: ErrorCode.UNKNOWN_ERROR,
          msg: errorMsg,
        };
      });

      return errorChapter;
    }
  }

  /**
   * Update the A-Frame scene with the current chapter
   */
  private updateSceneWithCurrentChapter(): void {
    const currentChapter = this.getCurrentChapter();

    if (!currentChapter || currentChapter.status !== LoadingState.LOADED) {
      console.warn(
        "Cannot update scene: current chapter not available or not loaded"
      );
      return;
    }

    // Get the scene manager and update the scene
    const sceneManager = this.game.scene;
    if (sceneManager) {
      sceneManager.updateSceneWithChapter(currentChapter);
    } else {
      console.warn("Cannot update scene: scene manager not available");
    }
  }
}
