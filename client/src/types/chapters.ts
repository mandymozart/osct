import { LoadingState } from "./common";
import { TargetData } from "./targets";

export interface IChapterManager {
  getCurrentChapter(): string | null;
  switchChapter(id: string): void;
  register(id: string): void;
  markLoading(id: string): void;
  markLoaded(id: string): void;
  markFailed(id: string, error: Error): void;
  isLoaded(id: string): boolean;
  getLoadingStatus(): { loaded: number; total: number };
}

// Pseudo type for the configuration file
export type ChapterConfiguration = ChapterData[];

export interface ChapterState {
  id: string;
  status: LoadingState;
  error?: Error;
}

export interface ChapterManagerState {
  currentChapter: string | null;
  chapters: Record<string, ChapterState>;
}

/**
 * Base data structure for a chapter 
 * Similar to ChapterContent
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
