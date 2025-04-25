import config from "./../../game.config.json";
import { ConfigurationVersion, IGame, TargetHistoryEntry as HistoryEntry, IHistoryManager, ErrorInfo } from '@/types';
import { getTargets } from '@/utils/config';

/**
 * Manages user history and progress tracking
 */
export class HistoryManager implements IHistoryManager {
  private game: IGame;
  private history: HistoryEntry[] = [];
  private readonly HISTORY_STORAGE_KEY = 'ar-game-target-history';
  private readonly CONFIG_VERSION_KEY = 'ar-game-config-version';

  constructor(game: IGame) {
    this.game = game;
    this.load();
  }

  /**
   * Check if configuration has changed
   */
  private checkConfigurationVersion(): void {
    try {
      const storedVersion = localStorage.getItem(this.CONFIG_VERSION_KEY);
      const currentVersion = config.version;

      if (!storedVersion) {
        this.saveConfigurationVersion();
        return;
      }

      const storageVersion = JSON.parse(storedVersion) as ConfigurationVersion;

      if (storageVersion.version !== currentVersion.version) {
        console.warn(
          `Game configuration has changed from version ${storageVersion.version} to ${currentVersion.version}. ` +
          `Last update was on ${new Date(storageVersion.timestamp).toLocaleDateString()}. ` +
          `Some chapter or target data might have changed.`
        );
      }

      this.saveConfigurationVersion();
    } catch (error) {
      console.warn('Failed to check configuration version:', error);
    }
  }

  /**
   * Save current configuration version
   */
  private saveConfigurationVersion(): void {
    try {
      const versionData: ConfigurationVersion = config.version as unknown as ConfigurationVersion;
      localStorage.setItem(this.CONFIG_VERSION_KEY, JSON.stringify(versionData));
    } catch (error) {
      console.warn('Failed to save configuration version:', error);
    }
  }

  /**
   * Load target history from local storage
   */
  public load(): void {
    try {
      // Check if configuration has changed
      this.checkConfigurationVersion();
      
      // Get history from localStorage
      const historyJson = localStorage.getItem(this.HISTORY_STORAGE_KEY);
      
      if (historyJson) {
        // Parse history
        const loadedHistory = JSON.parse(historyJson) as HistoryEntry[];
        this.history = loadedHistory;
        
        // If there are previous entries, notify the user they can resume
        if (loadedHistory.length > 0) {
          // Get the most recent entry
          const lastEntry = loadedHistory.sort((a, b) => b.timestamp - a.timestamp)[0];
          
          // Find chapter in config 
          const chapterConfig = config.chapters.find(ch => ch.id === lastEntry.chapterId);
          const chapterName = chapterConfig?.title || lastEntry.chapterId;
          
          // Create a notification with resume action
          this.game.notifyError({
            msg: `You have a previous session in chapter "${chapterName}".`,
            action: {
                text: 'Resume',
                callback: () => {
                  // Resume the last chapter using switchChapter
                  this.game.chapters.switchChapter(lastEntry.chapterId);
                }
            }
          } as ErrorInfo);
        }
      }
    } catch (error) {
      console.error("Failed to load history:", error);
    }
  }

  /**
   * Mark a target as seen by the user
   */
  public markTargetAsSeen(chapterId: string, targetIndex: number): void {
    const existingEntry = this.history.find(
      entry => entry.chapterId === chapterId && entry.targetIndex === targetIndex
    );

    if (!existingEntry) {
      // Update history using game store update pattern
      this.game.update(draft => {
        if (!draft.history) {
          draft.history = [];
        }
        
        draft.history.push({
          chapterId,
          targetIndex,
          timestamp: Date.now()
        });
        
        // Update local reference to match store state
        this.history = draft.history;
      });

      // Save updated history
      this.saveTargetHistory();
    }
  }

  /**
   * Check if a target has been seen before
   */
  public hasTargetBeenSeen(chapterId: string, targetIndex: number): boolean {
    return this.history.some(
      entry => entry.chapterId === chapterId && entry.targetIndex === targetIndex
    );
  }

  /**
   * Get all target indices that have been seen in a specific chapter
   */
  public getSeenTargetsForChapter(chapterId: string): number[] {
    return this.history
      .filter(entry => entry.chapterId === chapterId)
      .map(entry => entry.targetIndex);
  }

  /**
   * Calculate the percentage of targets seen in a chapter
   */
  public getChapterCompletionPercentage(chapterId: string): number {
    const chapter = this.game.state.chapters[chapterId] ||
      config.chapters.find(ch => ch.id === chapterId);

    if (!chapter) return 0;

    const totalTargets = getTargets(chapterId).length || 0;
    if (totalTargets === 0) return 100; // No targets = 100% complete

    const seenTargets = this.getSeenTargetsForChapter(chapterId).length;
    return Math.round((seenTargets / totalTargets) * 100);
  }

  /**
   * Check if all targets in a chapter have been seen
   */
  public isChapterComplete(chapterId: string): boolean {
    return this.getChapterCompletionPercentage(chapterId) === 100;
  }

  /**
   * Reset seen history for a specific chapter
   */
  public resetChapterHistory(chapterId: string): void {
    // Update history using game store update pattern
    this.game.update(draft => {
      if (!draft.history) {
        draft.history = [];
        return;
      }
      
      draft.history = draft.history.filter((entry: { chapterId: string }) => entry.chapterId !== chapterId);
      
      // Update local reference to match store state
      this.history = draft.history;
    });

    this.saveTargetHistory();
  }

  /**
   * Reset all target history
   */
  public reset(): void {
    this.game.update(draft => {
      draft.history = [];
      // Update local reference
      this.history = [];
    });
    
    this.saveTargetHistory();
  }

  /**
   * Save target history to local storage
   */
  private saveTargetHistory(): void {
    try {
      localStorage.setItem(
        this.HISTORY_STORAGE_KEY,
        JSON.stringify(this.history)
      );
    } catch (error) {
      console.warn('Failed to save target history to localStorage:', error);
    }
  }

  /**
   * Load target history from local storage
   */
  private loadTargetHistory(): void {
    try {
      const storedHistory = localStorage.getItem(this.HISTORY_STORAGE_KEY);
      if (storedHistory) {
        this.history = JSON.parse(storedHistory);
      }
    } catch (error) {
      console.warn('Failed to load target history from localStorage:', error);
    }
  }
}
