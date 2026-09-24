// Type definitions for content processing

export interface BaseContent {
  id: string;
  type: string;
  title: 'spread' | 'target' | 'asset' | 'step';
  description: string;
}

export interface SpreadContent extends BaseContent {
  type: 'spread';
  order: number;
  mindSrc: string;
}

export interface TargetContent extends BaseContent {
  type: 'target';
  relatedSpread: string;
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

export type EntryCategory = 'glossary' | 'videos' | 'texts' | 'links';

export interface EntryContent {
  id: string;
  type: 'entry';
  category: EntryCategory;
  title: string;
  page: number; // access page in the book
  author?: string; // texts
  body: string;
  image?: string; // file next to entry.yaml
  media?: string; // links: external URL
  target?: string; // optional target id (1:1)
  hideFromIndex: boolean;
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
