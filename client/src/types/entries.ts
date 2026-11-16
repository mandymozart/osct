// `Entry`, `EntryCategory` and `ENTRY_CATEGORIES` come from the engine's content types (./game-config.ts)
import type { EntryCategory } from "./game-config";

/** The list's "All" view: every entry of the Marginalia menu (glossary, texts, links) by page – not a content category */
export const ALL_CATEGORY = "all";

/** What the entries list shows: one content category, or All (#286) */
export type ListCategory = EntryCategory | typeof ALL_CATEGORY;
