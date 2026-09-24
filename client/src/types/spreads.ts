import { LoadingState } from "./common";
import { Entry } from "./entries";
import { SpreadData } from "./game-config";
import { Target } from "./targets";

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
 * App model of a spread (mapped from `SpreadData` by `utils/game-config.ts`).
 */
export interface Spread extends SpreadData {
  entries: Entry[]; // every entry on the spread's pages, with or without target
  targets: Target[]; // in MindAR index order (matches the spread's .mind)
}
