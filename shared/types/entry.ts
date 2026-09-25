/**
 * Entry categories, defined once for the content build (`scripts/`, schema + guard) and the app
 * (consultation mode). The values are what authors write in `content/entries/<id>/entry.yaml`.
 */
export enum EntryCategory {
  Glossary = "glossary",
  Videos = "videos",
  Texts = "texts",
  Links = "links",
}

/** All categories in menu order (design p.15) */
export const ENTRY_CATEGORIES: readonly EntryCategory[] = Object.values(EntryCategory);
