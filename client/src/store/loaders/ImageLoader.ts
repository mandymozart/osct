import { AssetType } from '../../types/loadable-store';
import { AssetLoader, AssetLoaderOptions } from './types';

/**
 * Loader for image assets
 */
export class ImageLoader implements AssetLoader {
  /**
   * Check if this loader handles the given asset type
   */
  canHandle(type: AssetType): boolean {
    return type === 'image';
  }

  /**
   * Load an image asset
   */
  load({ src, clearTimeout, resolve, reject }: AssetLoaderOptions): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      clearTimeout();
      resolve();
    };
    
    img.onerror = () => {
      clearTimeout();
      reject(new Error(`Failed to load image: ${src}`));
    };
    
    img.src = src;
  }
}
