import { ChapterData, ChapterResource, IGame } from "../../../types";

/**
 * Responsible for accessing and storing chapter data
 * Serves as the data access layer for chapters
 */
export class ChapterRepository {
  private data: ChapterData[];
  private game: IGame;

  constructor(game: IGame, data: ChapterData[]) {
    this.game = game;
    this.data = data;
  }

  /**
   * Get raw chapter data by ID
   */
  getChapterData(chapterId: string): ChapterData | null {
    const chapterData = this.data.find(chapter => chapter.id === chapterId);
    return chapterData || null;
  }

  /**
   * Get all available chapter data
   */
  getAllChapterData(): ChapterData[] {
    return [...this.data];
  }

  /**
   * Get a cached chapter resource with loading state
   */
  getCachedChapter(chapterId: string): ChapterResource | null {
    if (!this.game.state.chapters) return null;
    return this.game.state.chapters[chapterId] || null;
  }

  /**
   * Get the currently active chapter
   */
  getCurrentChapter(): ChapterResource | null {
    return this.game.state.currentChapter || null;
  }

  /**
   * Add or update a chapter in the cache
   */
  cacheChapter(chapter: ChapterResource): void {
    this.game.set({
      chapters: {
        ...this.game.state.chapters,
        [chapter.id]: chapter
      }
    });
  }

  /**
   * Set the current active chapter
   */
  setCurrentChapter(chapter: ChapterResource): void {
    this.game.set({ currentChapter: chapter });
  }
}
