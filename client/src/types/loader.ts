import { AssetType } from "@/types";

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
