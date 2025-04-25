/**
 * Base data structure for an asset without loading state
 */
export interface AssetData {
  id: string;
  type: 'asset';
  assetType: AssetType;
  src?: string;
}

/**
 * Asset type definition for consistent type usage across the system
 */
export type AssetType = 'image' | 'gltf' | 'glb' | 'audio' | 'video' | 'link';
