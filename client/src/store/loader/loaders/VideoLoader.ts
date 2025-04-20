import { AssetType } from '../../../types/loadable-store';
import { IAssetLoader, LoaderOptions } from '../../../types/loader';

/**
 * Loader for video assets
 */
export class VideoLoader implements IAssetLoader {
  /**
   * Check if this loader handles the given asset type
   */
  canHandle(type: AssetType): boolean {
    return type === 'video';
  }

  /**
   * Load a video asset
   */
  load({ src, clearTimeout, resolve, reject }: LoaderOptions): void {
    const video = document.createElement('video');
    
    video.oncanplaythrough = () => {
      clearTimeout();
      resolve();
    };
    
    video.onerror = () => {
      clearTimeout();
      reject(new Error(`Failed to load video: ${src}`));
    };
    
    // Start loading the video file
    video.src = src;
    // Some browsers won't start loading until you call load()
    video.load();
  }
}
