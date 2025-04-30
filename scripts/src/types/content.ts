// Type definitions for content processing

export interface BaseContent {
  id: string;
  type: string;
  title: 'chapter' | 'target' | 'asset' | 'step';
  description: string;
}

export interface ChapterContent extends BaseContent {
  type: 'chapter';
  order: number;
  mindSrc: string;
}

export interface TargetContent extends BaseContent {
  type: 'target';
  relatedChapter: string;
  order: number;
  bookId: string;
  entityType: EntityType; // This were we link targets to entities
  imageTargetSrc: string;
  mindSrc: string;
  assets: string | string[];
  hideFromIndex?: boolean;
  relatedTargets?: string | string[];
  tags?: string | string[];
}

export type EntityType = 'basic' | 'model' | 'video' | 'link';

export type AssetType = 'image' | 'gltf' | 'glb' | 'audio' | 'video' | 'link' | string;

export interface AssetContent extends BaseContent {
  type: 'asset';
  assetType: AssetType;
  src: string;
  position?: {
    x: number;
    y: number;
    z: number;
  };
  rotation?: {
    x: number;
    y: number;
    z: number;
  };
  scale?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface StepContent extends BaseContent {
  type: 'step';
  order: number;
}
