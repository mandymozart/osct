import { Entry } from "./entries";
import { SpreadData } from "./game-config";
import { Target } from "./targets";

export interface ISpreadManager {
  getCurrentSpread(): string | null;
  switchSpread(id: string): void;
}

export interface SpreadManagerState {
  currentSpread: string | null;
}

/**
 * App model of a spread (mapped from `SpreadData` by `utils/game-config.ts`).
 */
export interface Spread extends SpreadData {
  entries: Entry[]; // every entry on the spread's pages, with or without target
  targets: Target[]; // in entry order (page → title)
}
