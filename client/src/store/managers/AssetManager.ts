import { getAssets } from '@/utils/config';
import { AssetState, IAssetManager } from '../../types/assets';
import { LoadingState } from '../../types/common';
import { IGame } from '../../types/game';

/**
 * Manages A-Frame assets through game state
 */
export class AssetManager implements IAssetManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
  }

  public register(id: string): void {
    if (this.game.state.assets[id]) {
      console.warn(`[AssetManager] Asset ${id} already registered, skipping`);
      return;
    }
    
    console.log('Current assets before register:', this.game.state.assets);
    
    const updatedAssets = {
      ...this.game.state.assets,
      [id]: {
        id,
        status: LoadingState.INITIAL,
      }
    };
    
    this.game.set({
      assets: updatedAssets
    });
    
    console.log('Assets after register attempt:', this.game.state.assets);
  }

  public markLoading(id: string) {
    if (!this.game.state.assets[id]) {
      console.warn(`[AssetManager] Asset ${id} not found, registering first`);
      this.register(id);
      
      // Return early since register() might not update state immediately
      setTimeout(() => this.markLoading(id), 0);
      return;
    }
    
    const asset = this.game.state.assets[id];
    console.log(`[AssetManager] Marking asset ${id} as loading. Current status:`, 
      asset ? asset.status : 'undefined');
    
    if (asset && asset.status !== LoadingState.INITIAL) {
      console.log(`[AssetManager] Asset ${id} not in INITIAL state, skipping`);
      return;
    }
    
    const updatedAssets = {
      ...this.game.state.assets,
      [id]: {
        ...this.game.state.assets[id],
        status: LoadingState.LOADING
      }
    };
    
    this.game.set({
      assets: updatedAssets
    });
    
    console.log(`[AssetManager] Asset ${id} marked as loading`);
  }

  public markLoaded(id: string): void {
    if (!this.game.state.assets[id]) {
      console.warn(`[AssetManager] Asset ${id} not found, registering and marking as loaded`);
      
      const updatedAssets = {
        ...this.game.state.assets,
        [id]: {
          id,
          status: LoadingState.LOADED
        }
      };
      this.game.set({
        assets: updatedAssets
      });
      
      console.log(`[AssetManager] Asset ${id} created and marked as loaded`);
      return;
    }
    
    const asset = this.game.state.assets[id];
    if (asset.status === LoadingState.LOADED) {
      console.log(`[AssetManager] Asset ${id} already loaded, skipping`);
      return;
    }
    
    // Create a new assets object with the updated asset
    const updatedAssets = {
      ...this.game.state.assets,
      [id]: {
        ...this.game.state.assets[id],
        status: LoadingState.LOADED
      }
    };
    
    // Update state
    this.game.set({
      assets: updatedAssets
    });
    
    console.log(`[AssetManager] Asset ${id} marked as loaded`);
  }

  public markFailed(id: string, error: Error): void {
    if (!this.game.state.assets[id]) {
      console.warn(`[AssetManager] Asset ${id} not found, registering and marking as failed`);
      
      const updatedAssets = {
        ...this.game.state.assets,
        [id]: {
          id,
          status: LoadingState.ERROR,
          error
        }
      };
      
      this.game.set({
        assets: updatedAssets
      });
      
      console.error(`[AssetManager] Asset ${id} created and marked as failed:`, error);
      return;
    }
    
    const updatedAssets = {
      ...this.game.state.assets,
      [id]: {
        ...this.game.state.assets[id],
        status: LoadingState.ERROR,
        error
      }
    };
    
    this.game.set({
      assets: updatedAssets
    });
    
    console.error(`[AssetManager] Asset ${id} marked as failed:`, error);
  }

  public areChapterAssetsLoaded(chapterId: string): boolean {
    const chapterAssets = this.getChapterAssets(chapterId);
    if (chapterAssets.length === 0) {
      return true; 
    }

    return chapterAssets.every((asset) => asset.status === LoadingState.LOADED);
  }

  private getChapterAssets(chapterId: string): AssetState[] {
    const configAssets = getAssets(chapterId);

    return Object.entries(this.game.state.assets)
      .filter(([assetId]) => {
        const isRegistered = configAssets.some(
          (configAsset) => configAsset.id === assetId,
        );
        return isRegistered;
      })
      .map(([_, asset]) => asset);
  }

  public getLoadingStatus(): { loaded: number; total: number } {
    const assets = Object.values(this.game.state.assets);
    const loaded = assets.filter(
      (asset) => asset.status === LoadingState.LOADED,
    ).length;
    return {
      loaded,
      total: assets.length,
    };
  }
}