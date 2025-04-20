import { AssetType } from '../loadable-store';
import { ErrorCode } from '../';

/**
 * Options for loading assets
 */
export interface LoadOptions {
  /** Source URL of the asset */
  src: string;
  /** Type of asset to load */
  type: AssetType;
  /** Optional timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Result of an asset loading operation
 */
export interface LoadResult {
  /** Whether the asset was loaded successfully */
  success: boolean;
  /** Error information if loading failed */
  error?: Error;
}

/**
 * Internal loader options (not exposed to public API)
 */
export interface LoaderOptions {
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
export interface IAssetLoader {
  /**
   * Load an asset
   * @param options Loading options
   */
  load(options: LoaderOptions): void;
  
  /**
   * Check if this loader can handle a specific asset type
   * @param type Asset type
   * @returns True if this loader can handle the asset type
   */
  canHandle(type: AssetType): boolean;
}
