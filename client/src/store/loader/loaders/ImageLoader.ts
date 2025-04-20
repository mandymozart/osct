import { AssetType } from '../../../types/loadable-store';
import { IAssetLoader, LoaderOptions } from '../../../types/loader';

/**
 * Loader for image assets
 */
export class ImageLoader implements IAssetLoader {
  /**
   * Check if this loader handles the given asset type
   */
  canHandle(type: AssetType): boolean {
    return type === 'image';
  }

  /**
   * Load an image asset
   */
  load({ src, clearTimeout, resolve, reject }: LoaderOptions): void {
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
