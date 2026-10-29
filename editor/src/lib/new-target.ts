import { ENTRY_CATEGORIES, EntryCategory, type EntityType } from "@engine/types";

/** What may appear on the page of a new target ("" = nothing yet, the Entity panel adds it later) */
export const APPEARS: readonly (EntityType | "")[] = ["", "model", "video", "image", "text", "group", "light"];

/** The entry's categories – the reader's consultation menu (Glossary, Videos, Texts, Links) */
export const CATEGORIES: readonly EntryCategory[] = ENTRY_CATEGORIES;

/**
 * The entry category a new target starts with, following what appears on the page (#165): a video makes an entry of
 * the Videos; anything else a glossary term. Text (a literary text with its author) and Link (a web page) say what the
 * entry is in the book, not what appears, so they stay the author's choice.
 */
export const categoryFor = (appears: EntityType | ""): EntryCategory => (appears === "video" ? EntryCategory.Video : EntryCategory.Glossary);
