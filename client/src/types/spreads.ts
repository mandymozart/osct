import { LoadingState } from "./common";
import { TargetData } from "./targets";

export interface ISpreadManager {
  getCurrentSpread(): string | null;
  switchSpread(id: string): void;
  register(id: string): void;
  markLoading(id: string): void;
  markLoaded(id: string): void;
  markFailed(id: string, error: Error): void;
  isLoaded(id: string): boolean;
  getLoadingStatus(): { loaded: number; total: number };
}

// Pseudo type for the configuration file
export type SpreadConfiguration = SpreadData[];

export interface SpreadState {
  id: string;
  status: LoadingState;
  error?: Error;
}

export interface SpreadManagerState {
  currentSpread: string | null;
  spreads: Record<string, SpreadState>;
}

/**
 * Base data structure for a spread 
 * Similar to SpreadContent
 */
export interface SpreadData {
  id: string;
  order: number;
  firstPage: number;
  lastPage: number;
  title: string;
  mindSrc: string;
  targets: TargetData[];
}
