import { LoadOptions, LoadResult } from '@/types/loader';
import { AFrameAssetMonitor } from './AFrameAssetMonitor';
import { IGame } from '@/types';

/**
 * Asset loader service that integrates with A-Frame's asset system
 * instead of implementing its own loading logic
 */
class Loader {
  private assetMonitor: AFrameAssetMonitor;
  private game: IGame | null = null;
  
  constructor() {
    this.assetMonitor = new AFrameAssetMonitor();
  }
  
  /**
   * Set the game instance for this loader
   * This connects the loader to the game state and SceneManager
   */
  setGame(game: IGame): void {
    this.game = game;
    this.assetMonitor.setGame(game);
  }
  
  /**
   * Load an asset through A-Frame's asset system
   * @param options Asset loading options
   * @returns Promise that resolves with the loading result
   */
  async load({ src, type }: LoadOptions): Promise<LoadResult> {
    // Special case for link type assets
    if (type === 'link') {
      return { success: true };
    }
    
    // Make sure we have a reference to the game instance
    if (!this.game) {
      console.warn('Loader: No game instance set. Asset loading may fail if A-Frame scene is not accessible.');
    }
    
    try {
      // Use the A-Frame asset monitor to track the asset
      return await this.assetMonitor.loadAsset(src, type);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(`Error loading asset: ${error}`)
      };
    }
  }
  
  /**
   * Load multiple assets in parallel
   * @param options Array of asset loading options
   * @returns Promise that resolves with results of all loading operations
   */
  async loadMany(options: LoadOptions[]): Promise<LoadResult[]> {
    const loadPromises = options.map(opt => this.load(opt));
    return Promise.all(loadPromises);
  }
}

// Export a singleton instance for use throughout the app
export const loader = new Loader();
