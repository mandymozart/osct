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

  public register(id: string, state?: AssetState): void {
    if (this.game.state.assets[id]) return;

    this.game.update((draft) => {
      draft.assets[id] = state || {
        status: LoadingState.INITIAL,
      };
    });
  }

  public markLoading(id: string) {
    if (!this.game.state.assets[id]) {
      this.register(id);

      // Return early since register() might not update state immediately
      setTimeout(() => this.markLoading(id), 0);
      return;
    }
    const asset = this.game.state.assets[id];
    if (asset && asset.status !== LoadingState.INITIAL) return;

    this.game.update((draft) => {
      draft.assets[id].status = LoadingState.LOADING;
    });
  }

  public markLoaded(id: string): void {
    if (!this.game.state.assets[id]) {
      this.game.update((draft) => {
        draft.assets[id] = {
          status: LoadingState.LOADED,
        };
      });
      return;
    }

    const asset = this.game.state.assets[id];
    if (asset.status === LoadingState.LOADED) return;

    this.game.update((draft) => {
      draft.assets[id].status = LoadingState.LOADED;
    });
  }

  public markFailed(id: string, error: Error): void {
    if (!this.game.state.assets[id]) {
      this.game.update((draft) => {
        draft.assets[id] = {
          status: LoadingState.ERROR,
          error,
        };
      });
      return;
    }
    this.game.update((draft) => {
      draft.assets[id].status = LoadingState.ERROR;
      draft.assets[id].error = error;
    });
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
