import type { AssetType } from "./game-config";

/**
 * Options for loading assets
 */
export interface LoadOptions {
  /** Source URL of the asset */
  src: string;
  /** Type of asset to load – a video's subtitle file is no asset of a node, it comes with its video */
  type: AssetType | "subtitles";
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
