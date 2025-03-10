import { produce } from 'immer';
import { chapters } from "../../src/data/chapters.js";
import { LoadableStore } from '../LoadableStore.js';
import { ErrorCode } from '../types';
import { Asset, Chapter, ChapterData } from "../types.js";

/**
 * Manages chapter loading, initialization, and caching
 */
export class ChapterManager {
  private store: LoadableStore; // Reference to the main store
  
  constructor(store: any) {
    this.store = store;
  }
  
  /**
   * Get a cached chapter if available
   */
  getCachedChapter(chapterId: string): Chapter | null {
    const cachedChapter = this.store.state.cachedChapters[chapterId];
    if (cachedChapter && cachedChapter.loaded) {
      return cachedChapter;
    }
    return null;
  }
  
  /**
   * Switch to a different chapter
   */
  switchChapter(chapterId: string): void {
    // Check if already on this chapter
    if (this.store.state.currentChapter?.id === chapterId && 
        this.store.state.currentChapter.loaded) {
      return;
    }
    
    // Check cache first
    const cachedChapter = this.getCachedChapter(chapterId);
    if (cachedChapter) {
      console.log(`Loading chapter from cache: ${chapterId}`);
      this.store.set({ currentChapter: cachedChapter });
      return;
    }
    
    // Find the chapter in our data
    const chapterData = chapters.find((ch: any) => ch.id === chapterId);
    if (!chapterData) {
      const errorMsg = `Chapter ${chapterId} not found.`;
      console.error(errorMsg);
      
      // Create a minimal failed chapter object
      const failedChapter = this.store.markAsFailed(
        { id: chapterId } as Partial<Chapter>,
        ErrorCode.CHAPTER_NOT_FOUND,
        errorMsg
      ) as Chapter;
      
      this.store.set({ 
        currentChapter: failedChapter,
        trackedTargets: [] 
      });
      return;
    }

    // Initialize loading states for the chapter and its children
    const newChapter = this.initializeChapterLoadingStates(chapterData);
    
    // Mark the chapter as loading
    const loadingChapter = this.store.markAsLoading(newChapter);
    
    // Clear tracked targets when switching chapters
    this.store.set({ 
      currentChapter: loadingChapter,
      trackedTargets: []
    });

    // Load all chapter assets
    this.loadChapterResources(loadingChapter)
      .then((loadedChapter: Chapter) => {
        // Update cache with fully loaded chapter using Immer
        this.store.state = produce(this.store.state, draft => {
          draft.currentChapter = loadedChapter;
          draft.cachedChapters[chapterId] = loadedChapter;
        });
        
        this.store.notifyListeners();
      })
      .catch((error: unknown) => {
        console.error(`Error loading chapter ${chapterId}:`, error);
        
        // Mark chapter as failed
        const failedChapter = this.store.markAsFailed(
          loadingChapter,
          ErrorCode.UNKNOWN_ERROR,
          error instanceof Error ? error.message : "Failed to load chapter"
        ) as Chapter;
        
        this.store.set({ currentChapter: failedChapter });
      });
  }

  /**
   * Initialize loading states specifically for a chapter structure
   */
  private initializeChapterLoadingStates(chapterData: ChapterData): Chapter {
    // Create deep clone of chapter to avoid modifying original data
    const chapter = JSON.parse(JSON.stringify(chapterData));
    
    // Use Immer for initialization
    return produce<Chapter>(chapter, draft => {
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
                error: null
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
  private async loadChapterResources(chapter: Chapter): Promise<Chapter> {
    try {
      // Create a working copy of the chapter
      let workingChapter = { ...chapter };
      
      // Process each target
      if (workingChapter.targets) {
        for (let i = 0; i < workingChapter.targets.length; i++) {
          // Use Immer to update the working chapter
          workingChapter = produce(workingChapter, draft => {
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
          this.store.set({ currentChapter: workingChapter });
          
          const target = workingChapter.targets[i];
          
          if (target.entity) {
            // Mark entity as loading
            const entity = target.entity;
            
            // Process assets if they exist
            if (entity.assets && entity.assets.length > 0) {
              try {
                const loadedAssets = await this.store.loadAssets<Asset>(entity.assets);
                
                // Check if any assets failed to load
                const failedAssets = loadedAssets.filter(asset => asset.error !== null);
                
                // Update with loaded assets using Immer
                workingChapter = produce(workingChapter, draft => {
                  if (failedAssets.length > 0) {
                    // Some assets failed
                    draft.targets[i].entity.isLoading = false;
                    draft.targets[i].entity.loaded = false;
                    draft.targets[i].entity.error = {
                      code: ErrorCode.SOME_ASSETS_NOT_FOUND,
                      msg: `Failed to load ${failedAssets.length} assets`
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
                workingChapter = produce(workingChapter, draft => {
                  draft.targets[i].entity.isLoading = false;
                  draft.targets[i].entity.loaded = false;
                  draft.targets[i].entity.error = {
                    code: ErrorCode.ENTITY_LOAD_FAILED,
                    msg: error instanceof Error ? error.message : "Failed to load entity assets"
                  };
                });
              }
            } else {
              // No assets to load, mark entity as loaded
              workingChapter = produce(workingChapter, draft => {
                draft.targets[i].entity.isLoading = false;
                draft.targets[i].entity.loaded = true;
                draft.targets[i].entity.error = null;
              });
            }
          }
          
          // Mark target as loaded
          workingChapter = produce(workingChapter, draft => {
            draft.targets[i].isLoading = false;
            draft.targets[i].loaded = true;
            draft.targets[i].error = null;
          });
          
          // Update state to show progress
          this.store.set({ currentChapter: workingChapter });
        }
      }
      
      // Mark the entire chapter as loaded
      return produce(workingChapter, draft => {
        draft.isLoading = false;
        draft.loaded = true;
        draft.error = null;
      });
    } catch (error) {
      console.error("Error in loadChapterResources:", error);
      throw error;
    }
  }
}
