/**
 * Content schema type definitions for the OSCT system
 * 
 * These interfaces define the structure of the YAML content files
 * used to generate the game.config.json file.
 * 
 * DANGER: Types need to be kept up to date with scripts package
 */

import { AssetType } from "./assets";
import { EntityType } from "./entities";

// Common base interface for all content types
export interface BaseContent {
  id: string;
  type: string;
}

// Chapter content schema
export interface ChapterContent extends BaseContent {
  type: 'chapter';
  order: number;
  title: string;
  firstPage: number;
  lastPage: number;
  imageTargetSrc: string;
}

// Asset content schema
export interface AssetContent extends BaseContent {
  type: 'asset';
  id: string;
  assetType: AssetType;
  src: string;
  title?: string;
  description?: string;
  tags?: string | string[];
}

// Target content schema
export interface TargetContent extends BaseContent {
  title: string;
  description: string;
  relatedChapter: string;
  order: number;
  bookId: string;
  imageTargetSrc?: string;
  entityType: EntityType;
  // Assets is just a reference list of asset IDs, not the full asset objects
  assets: string | string[];
  relatedTargets: string | string[];
  tags: string | string[];
}

// Tutorial step content schema
export interface StepContent extends BaseContent {
  type: 'step';
  index: number;
  title: string;
  description: string;
  illustration?: string;
}

// Type guard functions
export function isChapterContent(content: BaseContent): content is ChapterContent {
  return content.type === 'chapter';
}

export function isTargetContent(content: BaseContent): content is TargetContent {
  return content.type === 'target';
}

export function isAssetContent(content: BaseContent): content is AssetContent {
  return content.type === 'asset';
}

export function isStepContent(content: BaseContent): content is StepContent {
  return content.type === 'step';
}

// Helper types for processing content
export type ContentCollection = {
  chapters: ChapterContent[];
  targets: TargetContent[];
  steps: StepContent[];
};
