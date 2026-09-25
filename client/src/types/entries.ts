import { EntryData } from "./game-config";

export { EntryCategory, ENTRY_CATEGORIES } from "@shared/types/entry";
import { Target } from "./targets";

/**
 * App model of an entry (mapped from `EntryData` by `utils/game-config.ts`).
 * The spread is derived from the access page; the target has its entity ref resolved.
 */
export interface Entry extends Omit<EntryData, "target"> {
  spreadId: string;
  target?: Target;
}
