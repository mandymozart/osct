import { AssetType } from '../../../types/loadable-store';
import { IAssetLoader, LoaderOptions } from '../../../types/loader';

/**
 * Generic loader for any asset type not handled by specialized loaders
 * Acts as a fallback for unknown asset types
 */
export class GenericLoader implements IAssetLoader {
  /**
   * This loader handles any type as a fallback
   */
  canHandle(type: AssetType): boolean {
    // This loader serves as a fallback for any type
    // Should be registered last to ensure specialized loaders take precedence
    return true;
  }

  /**
   * Load any generic asset using fetch
   */
  load({ src, clearTimeout, resolve, reject }: LoaderOptions): void {
    fetch(src)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        clearTimeout();
        resolve();
      })
      .catch(error => {
        clearTimeout();
        reject(error);
      });
  }
}
