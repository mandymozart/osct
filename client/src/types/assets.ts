import { LoadingState } from "./common";

/**
 * State of an individual asset
 */
export interface AssetState {
  status: LoadingState; // Current loading state
  error?: Error; // Error information if loading failed
}

/**
 * Asset type definition for consistent type usage across the system
 */
export type AssetType = 'image' | 'gltf' | 'glb' | 'audio' | 'video' | 'link' | string;

/**
 * State managed by the AssetManager
 */
export interface AssetManagerState {
  assets: Record<string, AssetState>; // Keyed by asset ID
}

/**
 * Asset Manager interface for handling A-Frame assets
 */
export interface IAssetManager {
  /**
   * Register an asset for loading
   * @param id Unique identifier for the asset (format: chapter-target-asset-id)
   * @param type Type of the asset
   */
  register(id: string, state: AssetState): void;

  /**
   * Mark an asset as loaded (only works if asset previous state was INITIAL)
   * @param id Asset identifier
   */
  markLoading(id: string): void;

  /**
   * Mark an asset as loaded
   * @param id Asset identifier
   */
  markLoaded(id: string): void;

  /**
   * Mark an asset as failed
   * @param id Asset identifier
   * @param error Error that occurred
   */
  markFailed(id: string, error: Error): void;

  /**
   * Check if a chapter's assets are all loaded
   * @param chapterId Chapter ID
   * @returns True if all assets with the chapter ID prefix are loaded
   */
  areChapterAssetsLoaded(chapterId: string): boolean;

  /**
   * Get loading status for all assets
   * @returns Status statistics
   */
  getLoadingStatus(): { loaded: number; total: number };
}
