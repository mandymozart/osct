import { AssetType } from '../../types/loadable-store';
import { AssetLoader, AssetLoaderOptions } from './types';

/**
 * Loader for audio assets
 */
export class AudioLoader implements AssetLoader {
  /**
   * Check if this loader handles the given asset type
   */
  canHandle(type: AssetType): boolean {
    return type === 'audio';
  }

  /**
   * Load an audio asset
   */
  load({ src, clearTimeout, resolve, reject }: AssetLoaderOptions): void {
    const audio = new Audio();
    
    audio.oncanplaythrough = () => {
      clearTimeout();
      resolve();
    };
    
    audio.onerror = () => {
      clearTimeout();
      reject(new Error(`Failed to load audio: ${src}`));
    };
    
    // Start loading the audio file
    audio.src = src;
    // Some browsers won't start loading until you call load()
    audio.load();
  }
}
