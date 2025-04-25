import { AssetData } from "./assets";

/**
 * Base data structure for an entity without loading state
 */
export interface EntityData {
  type: EntityType;
  assets: AssetData[];
}

/**
 * Type of an entity
 */
export type EntityType = 'basic' | 'model' | 'video' | 'link';
