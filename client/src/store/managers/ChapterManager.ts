import { ChapterState, IChapterManager, IGame, LoadingState } from '@/types';
import { getChapter, getChapters, getInitialChapterId } from '@/utils/config';

/**
 * Manages chapters through game state
 */
export class ChapterManager implements IChapterManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
    this.initialize()
  }

  /**
   * Initialize chapters from configuration
  */
  private initialize(): void {
    const chaptersData = getChapters();
    const chaptersState: Record<string, ChapterState> = {};
    
    chaptersData.forEach(chapter => {
      chaptersState[chapter.id] = {
        id: chapter.id,
        status: LoadingState.INITIAL
      };
    });
    this.game.update(draft => {
      draft.currentChapter = getInitialChapterId();
      draft.chapters = chaptersState;
    });
  }

  /**
   * Get the current chapter ID
   */
  public getCurrentChapter(): string | null {
    return this.game.state.currentChapter;
  }

  /**
   * Switch to a different chapter
   * @param id The ID of the chapter to switch to
   */
  public switchChapter(id: string): void {
    const chapterData = getChapter(id);
    if (!chapterData) {
      console.error(`[ChapterManager] "${id}" not found in configuration`);
      return 
    }

    if (!this.game.state.chapters[id]) {
      this.register(id);
    }

    this.game.update(draft => {
      draft.currentChapter = id;
    });

    console.log(`[ChapterManager] Switched to "${id}"`);
    return
  }

  /**
   * Register a chapter in the state
   */
  public register(id: string): void {
    if (this.game.state.chapters[id]) {
      console.warn(`[ChapterManager] "${id}" already registered, skipping`);
      return;
    }

    this.game.update(draft => {
      draft.chapters[id] = {
        id,
        status: LoadingState.INITIAL
      };
    });

    console.log(`[ChapterManager] Registered "${id}"`);
  }

  /**
   * Mark chapter as loading
   */
  public markLoading(id: string): void {
    if (!this.game.state.chapters[id]) {
      console.warn(`[ChapterManager] "${id}" not found, registering first`);
      this.register(id);
    }

    const chapter = this.game.state.chapters[id];
    if (chapter && chapter.status !== LoadingState.INITIAL) {
      console.log(`[ChapterManager] "${id}" not in INITIAL state, skipping`);
      return;
    }

    this.game.update(draft => {
      if (draft.chapters[id]) {
        draft.chapters[id].status = LoadingState.LOADING;
      }
    });

    console.log(`[ChapterManager] "${id}" marked as loading`);
  }

  /**
   * Mark chapter as loaded
   */
  public markLoaded(id: string): void {
    if (!this.game.state.chapters[id]) {
      console.warn(`[ChapterManager] "${id}" not found, registering and marking as loaded`);

      this.game.update(draft => {
        draft.chapters[id] = {
          id,
          status: LoadingState.LOADED
        };
      });

      console.log(`[ChapterManager] "${id}" created and marked as loaded`);
      return;
    }

    this.game.update(draft => {
      if (draft.chapters[id]) {
        draft.chapters[id].status = LoadingState.LOADED;
      }
    });

    console.log(`[ChapterManager] "${id}" marked as loaded`);
  }

  /**
   * Mark chapter as failed
   */
  public markFailed(id: string, error: Error): void {
    if (!this.game.state.chapters[id]) {
      console.warn(`[ChapterManager] "${id}" not found, registering and marking as failed`);

      this.game.update(draft => {
        draft.chapters[id] = {
          id,
          status: LoadingState.ERROR,
          error
        };
      });

      console.error(`[ChapterManager] "${id}" created and marked as failed:`, error);
      return;
    }

    this.game.update(draft => {
      if (draft.chapters[id]) {
        draft.chapters[id].status = LoadingState.ERROR;
        draft.chapters[id].error = error;
      }
    });

    console.error(`[ChapterManager] "${id}" marked as failed:`, error);
  }

  /**
   * Check if a chapter is loaded
   */
  public isLoaded(id: string): boolean {
    const chapter = this.game.state.chapters[id];
    return chapter?.status === LoadingState.LOADED;
  }

  /**
   * Get chapter loading status
   */
  public getLoadingStatus(): { loaded: number; total: number } {
    const chapters = Object.values(this.game.state.chapters);
    const loaded = chapters.filter(
      (chapter) => chapter.status === LoadingState.LOADED
    ).length;

    return {
      loaded,
      total: chapters.length
    };
  }
}