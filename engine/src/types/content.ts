/**
 * The content the engine works with: the contract of `shared/` (what the content build writes) and the app models
 * `content/game-config.ts` maps it to – a target knows its entry and spread, an entry its spread, a spread its
 * entries and targets, and entity refs are resolved.
 */
export * from "@shared/types/game-config";
export { EntryCategory, ENTRY_CATEGORIES } from "@shared/types/entry";
import type { EntityData, EntryData, SpreadData, TargetData } from "@shared/types/game-config";

/** App model of a target (mapped from `TargetData`); the entity ref is resolved */
export interface Target extends Omit<TargetData, "entity"> {
  entryId: string;
  spreadId: string;
  entity?: EntityData;
}

/** App model of an entry (mapped from `EntryData`): the spread is derived from the access page */
export interface Entry extends Omit<EntryData, "target"> {
  spreadId: string;
  target?: Target;
}

/** App model of a spread (mapped from `SpreadData`) */
export interface Spread extends SpreadData {
  /** Every entry on the spread's pages, with or without target */
  entries: Entry[];
  /** In entry order (page → title) */
  targets: Target[];
}
