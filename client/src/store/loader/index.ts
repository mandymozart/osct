import { IAssetLoader, LoadOptions, LoadResult } from '@/types/loader';
import { ImageLoader } from './loaders/ImageLoader';
import { GLTFLoader } from './loaders/GLTFLoader';
import { AudioLoader } from './loaders/AudioLoader';
import { VideoLoader } from './loaders/VideoLoader';
import { GenericLoader } from './loaders/GenericLoader';

/**
 * Asset loader service
 * Provides a simple API for loading various asset types
 */
class Loader {
  private loaders: IAssetLoader[] = [];
  private defaultTimeout = 30000; // 30 second default timeout
  
  constructor() {
    // Register all loaders in order of specificity
    this.loaders = [
      new ImageLoader(),
      new GLTFLoader(),
      new AudioLoader(),
      new VideoLoader(),
      new GenericLoader(), // Fallback loader, should be last
    ];
  }
  
  /**
   * Load an asset asynchronously
   * @param options Asset loading options
   * @returns Promise that resolves when the asset is loaded
   */
  async load({ src, type, timeout = this.defaultTimeout }: LoadOptions): Promise<LoadResult> {
    // Special case for link type assets which don't need loading
    if (type === 'link') {
      return { success: true };
    }
    
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({
          success: false,
          error: new Error(`Timeout loading asset: ${src}`)
        });
      }, timeout);
      
      try {
        // Find the right loader for this asset type
        const loader = this.loaders.find(loader => loader.canHandle(type));
        
        if (!loader) {
          clearTimeout(timeoutId);
          resolve({
            success: false,
            error: new Error(`No loader available for asset type: ${type}`)
          });
          return;
        }
        
        // Set up success and error handlers
        const handleSuccess = () => {
          resolve({ success: true });
        };
        
        const handleError = (error: any) => {
          resolve({
            success: false,
            error: error instanceof Error ? error : new Error(`Error loading asset: ${error}`)
          });
        };
        
        // Use the loader to load the asset
        loader.load({
          src,
          clearTimeout: () => clearTimeout(timeoutId),
          resolve: handleSuccess,
          reject: handleError
        });
      } catch (error) {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: error instanceof Error ? error : new Error(`Error loading asset: ${error}`)
        });
      }
    });
  }
  
  /**
   * Load multiple assets in parallel
   * @param options Array of asset loading options
   * @returns Promise that resolves with results of all loading operations
   */
  async loadMany(options: LoadOptions[]): Promise<LoadResult[]> {
    const loadPromises = options.map(opt => this.load(opt));
    return Promise.all(loadPromises);
  }
}

// Export a singleton instance for use throughout the app
export const loader = new Loader();
