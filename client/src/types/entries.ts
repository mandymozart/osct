/**
 * Entry categories (design 260804): glossary terms, AR documentation videos,
 * texts about the work, and links to all other media.
 */
export type EntryCategory = "glossary" | "videos" | "texts" | "links";

/**
 * An entry is top-level content. It may be revealed by one target (1:1);
 * entries without a target are only listed in consultation mode.
 */
export interface EntryData {
  id: string;
  category: EntryCategory;
  title: string;
  page: number; // access page in the book
  author?: string; // texts
  body: string;
  image?: string;
  media?: string; // links: external URL
  targetId?: string;
  spreadId?: string;
  hideFromIndex: boolean;
}
