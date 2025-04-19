// Type definitions for content processing

export interface BaseContent {
  id: string;
  type: string;
  title: string;
  description: string;
}

export interface ChapterContent extends BaseContent {
  type: 'chapter';
  order: number;
}

export interface TargetContent extends BaseContent {
  type: 'target';
  relatedChapter: string;
  order: number;
  bookId: string;
  targetType: string;
  imageTargetSrc: string;
  assets: string | string[];
  relatedTargets?: string | string[];
  tags?: string | string[];
}

export interface AssetContent extends BaseContent {
  type: 'asset';
  assetType: string;
  src: string;
  position?: any;
  rotation?: any;
  scale?: any;
}

export interface StepContent extends BaseContent {
  type: 'step';
  order: number;
}
