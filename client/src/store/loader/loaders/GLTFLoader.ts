import { AssetType } from '../../../types/loadable-store';
import { IAssetLoader, LoaderOptions } from '../../../types/loader';

/**
 * Loader for GLTF and GLB 3D model assets
 */
export class GLTFLoader implements IAssetLoader {
  /**
   * Check if this loader handles the given asset type
   */
  canHandle(type: AssetType): boolean {
    return type === 'gltf' || type === 'glb';
  }

  /**
   * Load a GLTF or GLB asset
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
