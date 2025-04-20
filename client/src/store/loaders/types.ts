import { AssetType } from '../../types/loadable-store';
import { ErrorCode } from '../../types';

/**
 * Options for asset loading operations
 */
export interface AssetLoaderOptions {
  /** Source URL of the asset */
  src: string;
  /** Function to clear the timeout */
  clearTimeout: () => void;
  /** Function to call when asset is loaded successfully */
  resolve: (value: void | PromiseLike<void>) => void;
  /** Function to call when asset loading fails */
  reject: (reason: any) => void;
}

/**
 * Interface for asset loaders
 */
export interface AssetLoader {
  /**
   * Load an asset
   * @param options Loading options
   */
  load(options: AssetLoaderOptions): void;
  
  /**
   * Check if this loader can handle a specific asset type
   * @param type Asset type
   * @returns True if this loader can handle the asset type
   */
  canHandle(type: AssetType): boolean;
}
