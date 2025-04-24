import { TargetData, Target, LoadableResource } from "../";

/** @deprecated Use IChapterManager instead */
export interface IChapterManager {
  getCurrentChapter(): ChapterResource | null;
  getCachedChapter(id: string): ChapterResource | null;
  switchChapter(id: string): Promise<void>;
}

// Pseudo type for the configuration file
/** @deprecated Use ChapterData[] instead */
export type ChapterConfiguration = ChapterData[];

/** @deprecated Use ChapterState instead */
export interface ChapterState {
  currentChapter: ChapterResource | null;
  chapters: Record<string, ChapterResource>;
}

/**
 * Base data structure for a chapter without loading state
 * @deprecated Use ChapterData instead
 */
export interface ChapterData {
  id: string;
  order: number;
  firstPage: number;
  lastPage: number;
  title: string;
  mindSrc: string;
  targets: TargetData[];
}

/**
 * Represents a chapter in the game with loading state
 * @deprecated Use ChapterResource instead
 */
export interface ChapterResource extends LoadableResource {
  id: string;
  targets: Target[];
}
