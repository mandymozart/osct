import { produce } from "immer";
import { Asset, ErrorCode, IGame, ChapterResource, ChapterData, IChapterManager } from "../../types";
import * as config from "./../../game.config.json"
import { c } from "vite/dist/node/types.d-aGj9QkWt";

/**
 * Manages chapter loading, initialization, and caching
 */
export class ChapterManager implements IChapterManager {
  private game: IGame;
  private data: ChapterData[] = [];

  constructor(game: IGame) {
    this.game = game;
    this.data = config.chapters;
    this.initialize();
  }

  /**
   * Initialize the game state with empty chapter resources
   * Maps static chapter data to mutable chapter resources in the game state
   */
  public initialize(): void {
    const chapters: Record<string, ChapterResource> = {};
    
    // Create initial chapter resources from static data
    this.data.forEach(chapterData => {
      // Initialize with loading states
      const chapterResource = this.initializeChapterLoadingStates(chapterData);
      chapters[chapterData.id] = chapterResource;
    });
    
    // Update the game state with the initialized chapters
    this.game.set({ chapters });
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
   * // TODO: remove promise
   */
  public async switchChapter(chapterId: string): Promise<void> {
    // Check if already on this chapter
    if (
      this.game.state.currentChapter?.id === chapterId &&
      this.game.state.currentChapter.loaded
    ) {
      return;
    }

    // Check cache first
    const cachedChapter = this.getCachedChapter(chapterId);
    if (cachedChapter && cachedChapter.loaded) {
      console.log("Chapter found loaded with resources in cache", cachedChapter)
      this.game.set({ currentChapter: cachedChapter });
      return;
    }

    // Find the chapter in our data
    const chapterData = this.data.find((ch) => ch.id === chapterId);
    if (!chapterData) {
      const errorMsg = `Chapter ${chapterId} not found.`;
      
      const failedChapter = this.game.markAsFailed(
        { id: chapterId } as Partial<ChapterResource>,
        ErrorCode.CHAPTER_NOT_FOUND,
        errorMsg
      ) as ChapterResource;

      this.game.set({
        currentChapter: failedChapter,
        trackedTargets: [],
      });
      
      this.game.notifyError({
        msg: errorMsg,
        code: ErrorCode.CHAPTER_NOT_FOUND,
      });
      
      throw new Error(errorMsg);
    }

    // Initialize and start loading
    try {
      // TODO: check if chapterData is required in loadChapterResources
      const newChapter = this.initializeChapterLoadingStates(chapterData);
      const loadingChapter = this.game.markAsLoading(newChapter);

      this.game.set({
        currentChapter: loadingChapter,
        trackedTargets: [],
      });

      const loadedChapter = await this.loadChapterResources(loadingChapter);

      // Update cache with fully loaded chapter
      this.game.state = produce(this.game.state, (draft) => {
        draft.currentChapter = loadedChapter;
        draft.chapters[chapterId] = loadedChapter;
      });

      this.game.notifyListeners();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to load chapter";
      
      const failedChapter = this.game.markAsFailed(
        { id: chapterId } as Partial<ChapterResource>,
        ErrorCode.UNKNOWN_ERROR,
        errorMsg
      ) as ChapterResource;

      this.game.set({ currentChapter: failedChapter });
      
      this.game.notifyError({
        msg: errorMsg,
        code: ErrorCode.UNKNOWN_ERROR,
      });
      
      throw error;
    }
  }

  /**
   * Initialize loading states specifically for a chapter structure
   */
  private initializeChapterLoadingStates(chapterData: ChapterData): ChapterResource {
    // Create deep clone of chapter to avoid modifying original data
    const chapter = JSON.parse(JSON.stringify(chapterData));

    // Use Immer for initialization
    return produce<ChapterResource>(chapter, (draft) => {
      // Initialize chapter's loading state
      draft.isLoading = false;
      draft.loaded = false;
      draft.error = null;

      // Initialize each target and its entity
      if (draft.targets) {
        draft.targets = draft.targets.map((target: any) => {
          // Initialize target loading state
          target.isLoading = false;
          target.loaded = false;
          target.error = null;

          // Initialize entity loading state
          if (target.entity) {
            target.entity.isLoading = false;
            target.entity.loaded = false;
            target.entity.error = null;

            // Initialize asset loading states
            if (target.entity.assets) {
              target.entity.assets = target.entity.assets.map((asset: any) => ({
                ...asset,
                isLoading: false,
                loaded: false,
                error: null,
              }));
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
  private async loadChapterResources(chapter: ChapterResource): Promise<ChapterResource> {
    console.log("loadChapterResources", chapter)
    try {
      // Create a working copy of the chapter
      let workingChapter = { ...chapter };

      // Process each target
      if (workingChapter.targets) {
        for (let i = 0; i < workingChapter.targets.length; i++) {
          // Use Immer to update the working chapter
          workingChapter = produce(workingChapter, (draft: ChapterResource) => {
            const target = draft.targets[i];

            // Mark target as loading
            target.isLoading = true;
            target.loaded = false;
            target.error = null;

            // Mark entity as loading if it exists
            if (target.entity) {
              target.entity.isLoading = true;
              target.entity.loaded = false;
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
                  (asset) => asset.error !== null
                );

                // Update with loaded assets using Immer
                workingChapter = produce(workingChapter, (draft: ChapterResource) => {
                  if (failedAssets.length > 0) {
                    // Some assets failed
                    draft.targets[i].entity.isLoading = false;
                    draft.targets[i].entity.loaded = false;
                    draft.targets[i].entity.error = {
                      code: ErrorCode.SOME_ASSETS_NOT_FOUND,
                      msg: `Failed to load ${failedAssets.length} assets`,
                    };
                    draft.targets[i].entity.assets = loadedAssets;
                  } else {
                    // All assets loaded successfully
                    draft.targets[i].entity.isLoading = false;
                    draft.targets[i].entity.loaded = true;
                    draft.targets[i].entity.error = null;
                    draft.targets[i].entity.assets = loadedAssets;
                  }
                });
              } catch (error) {
                // Handle error with Immer
                workingChapter = produce(workingChapter, (draft: ChapterResource) => {
                  draft.targets[i].entity.isLoading = false;
                  draft.targets[i].entity.loaded = false;
                  draft.targets[i].entity.error = {
                    code: ErrorCode.ENTITY_LOAD_FAILED,
                    msg:
                      error instanceof Error
                        ? error.message
                        : "Failed to load entity assets",
                  };
                });
              }
            } else {
              // No assets to load, mark entity as loaded
              workingChapter = produce(workingChapter, (draft: ChapterResource) => {
                draft.targets[i].entity.isLoading = false;
                draft.targets[i].entity.loaded = true;
                draft.targets[i].entity.error = null;
              });
            }
          }

          // Mark target as loaded
          workingChapter = produce(workingChapter, (draft: ChapterResource) => {
            draft.targets[i].isLoading = false;
            draft.targets[i].loaded = true;
            draft.targets[i].error = null;
          });

          // Update state to show progress
          this.game.set({ currentChapter: workingChapter });
        }
      }

      // Mark the entire chapter as loaded
      return produce(workingChapter, (draft: ChapterResource) => {
        draft.isLoading = false;
        draft.loaded = true;
        draft.error = null;
      });
    } catch (error) {
      throw error;
    }
  }
}
