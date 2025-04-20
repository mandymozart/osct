import * as config from "../../../game.config.json";
import {
  ChapterResource,
  ErrorCode,
  IChapterManager,
  IGame,
  LoadingState,
} from "../../../types";
import { ChapterErrorHandler } from "./ChapterErrorHandler";
import { ChapterInitializer } from "./ChapterInitializer";
import { ChapterLoader } from "./ChapterLoader";
import { ChapterRepository } from "./ChapterRepository";
import { ChapterSceneUpdater } from "./ChapterSceneUpdater";

/**
 * Manages chapter loading, initialization, and caching with improved modularity
 * Acts as the orchestrator for the specialized chapter modules
 */
export class ChapterManager implements IChapterManager {
  private game: IGame;

  private repository: ChapterRepository;
  private initializer: ChapterInitializer;
  private loader: ChapterLoader;
  private sceneUpdater: ChapterSceneUpdater;
  private errorHandler: ChapterErrorHandler;

  constructor(game: IGame) {
    this.game = game;

    // Initialize the specialized modules
    this.repository = new ChapterRepository(game, config.chapters);
    this.initializer = new ChapterInitializer(game);
    this.loader = new ChapterLoader(game);
    this.sceneUpdater = new ChapterSceneUpdater(game);
    this.errorHandler = new ChapterErrorHandler(game);

    // Initialize the game state
    this.initialize();
  }

  /**
   * Initialize the game state with empty chapter resources
   */
  initialize(): void {
    this.initializer.initializeGameState();
  }

  /**
   * Get a cached chapter if available
   */
  getCachedChapter(chapterId: string): ChapterResource | null {
    return this.repository.getCachedChapter(chapterId);
  }

  /**
   * Get the current chapter
   */
  getCurrentChapter(): ChapterResource | null {
    return this.repository.getCurrentChapter();
  }

  /**
   * Switch to a different chapter
   * @returns Promise that resolves when chapter is fully loaded
   */
  async switchChapter(chapterId: string): Promise<void> {
    try {
      if (
        this.game.state.currentChapter?.id === chapterId &&
        this.game.state.currentChapter.status === LoadingState.LOADED
      ) {
        this.updateSceneWithCurrentChapter();
        return;
      }

      const cachedChapter = this.getCachedChapter(chapterId);
      if (cachedChapter && cachedChapter.status === LoadingState.LOADED) {
        this.repository.setCurrentChapter(cachedChapter);
        this.updateSceneWithCurrentChapter();
        return;
      }
      const chapterData = this.repository.getChapterData(chapterId);
      if (!chapterData) {
        return this.handleChapterError(
          chapterId,
          ErrorCode.CHAPTER_NOT_FOUND,
          `Chapter not found: ${chapterId}`
        );
      }

      let chapter = this.initializer.createChapterResource(chapterData);
      this.repository.cacheChapter(chapter);
      this.repository.setCurrentChapter(chapter);
      chapter = this.initializer.markChapterAsLoading(chapter);
      this.repository.cacheChapter(chapter);
      this.repository.setCurrentChapter(chapter);
      const loadedChapter = await this.loader.loadChapterResources(chapter);
      this.repository.cacheChapter(loadedChapter);
      this.repository.setCurrentChapter(loadedChapter);
      if (loadedChapter.status === LoadingState.LOADED) {
        this.updateSceneWithCurrentChapter();
      }
    } catch (error) {
      console.error(
        `Unexpected error switching to chapter ${chapterId}:`,
        error
      );
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.handleChapterError(
        chapterId,
        ErrorCode.UNKNOWN_ERROR,
        errorMsg,
        error
      );
    }
  }

  /**
   * Update the A-Frame scene with the current chapter
   */
  private updateSceneWithCurrentChapter(): void {
    const currentChapter = this.getCurrentChapter();
    this.sceneUpdater.updateScene(currentChapter);
  }

  /**
   * Handle chapter error with consistent error reporting
   */
  private handleChapterError(
    chapterId: string,
    errorCode: ErrorCode,
    errorMsg: string,
    details?: any
  ): void {
    this.errorHandler.handleChapterError(
      chapterId,
      errorCode,
      errorMsg,
      details
    );
  }
}
