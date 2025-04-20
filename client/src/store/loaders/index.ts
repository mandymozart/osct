import { AssetType } from '../../types/loadable-store';
import { AssetLoader, AssetLoaderOptions } from './types';
import { ImageLoader } from './ImageLoader';
import { GLTFLoader } from './GLTFLoader';
import { AudioLoader } from './AudioLoader';
import { VideoLoader } from './VideoLoader';
import { GenericLoader } from './GenericLoader';

/**
 * Registry of all asset loaders
 * Uses the strategy pattern to select the appropriate loader for each asset type
 */
export class AssetLoaderRegistry {
  private loaders: AssetLoader[] = [];
  
  constructor() {
    // Register all loaders in order of specificity
    // The generic loader should be last as a fallback
    this.loaders = [
      new ImageLoader(),
      new GLTFLoader(),
      new AudioLoader(),
      new VideoLoader(),
      new GenericLoader(), // Fallback loader, should be last
    ];
  }
  
  /**
   * Load an asset using the appropriate loader
   */
  loadAsset({ src, type, clearTimeout, resolve, reject }: AssetLoaderOptions & { type: AssetType }): void {
    // Handle special case for links (which don't need actual loading)
    if (type === 'link') {
      resolve();
      return;
    }
    
    // Find the first loader that can handle this asset type
    const loader = this.loaders.find(loader => loader.canHandle(type));
    
    if (!loader) {
      reject(new Error(`No loader available for asset type: ${type}`));
      return;
    }
    
    // Use the loader to load the asset
    loader.load({ src, clearTimeout, resolve, reject });
  }
}

// Export a singleton instance for use throughout the app
export const assetLoaders = new AssetLoaderRegistry();

// Re-export types for convenience
export * from './types';
