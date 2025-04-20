import { AssetType } from '../../types/loadable-store';
import { AssetLoader, AssetLoaderOptions } from './types';

/**
 * Loader for video assets
 */
export class VideoLoader implements AssetLoader {
  /**
   * Check if this loader handles the given asset type
   */
  canHandle(type: AssetType): boolean {
    return type === 'video';
  }

  /**
   * Load a video asset
   */
  load({ src, clearTimeout, resolve, reject }: AssetLoaderOptions): void {
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
