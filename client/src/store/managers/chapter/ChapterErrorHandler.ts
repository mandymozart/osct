import {
  ChapterResource,
  ErrorCode,
  ErrorInfo,
  IGame,
  LoadingState,
} from "../../../types";

/**
 * Responsible for handling and standardizing chapter error states
 */
export class ChapterErrorHandler {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
  }

  /**
   * Create a standardized error chapter resource
   */
  createErrorChapter(
    chapterId: string,
    errorCode: ErrorCode,
    errorMsg: string,
    details?: any
  ): ChapterResource {
    // Create minimal error chapter structure
    const failedChapter: ChapterResource = {
      type: 'chapter',
      id: chapterId,
      src: "",
      status: LoadingState.ERROR,
      error: {
        code: errorCode,
        msg: errorMsg,
        details,
      },
      targets: [],
    };

    return failedChapter;
  }

  /**
   * Handle chapter error with consistent error reporting
   * Sets the error in the game state and notifies error listeners
   */
  handleChapterError(
    chapterId: string,
    errorCode: ErrorCode,
    errorMsg: string,
    details?: any
  ): ChapterResource {
    console.error(`Chapter error: [${errorCode}] ${errorMsg}`, details);

    // Create error chapter
    const errorChapter = this.createErrorChapter(
      chapterId,
      errorCode,
      errorMsg,
      details
    );

    // Set current chapter to error state
    this.game.set({ currentChapter: errorChapter });

    // Update chapter cache with error state
    this.game.set({
      chapters: {
        ...this.game.state.chapters,
        [chapterId]: errorChapter,
      },
    });

    // Create error info for the game error system
    const errorInfo: ErrorInfo = {
      code: errorCode,
      msg: `Chapter error: ${errorMsg}`,
      type: "warning",
      details,
    };

    // Notify game error listeners
    this.game.notifyError(errorInfo);

    return errorChapter;
  }
}
