/**
 * Game configuration contract – the shape of `game.config.json`.
 *
 * Written by the content build (`scripts/`), read by the app (`client/src/utils/game-config.ts`).
 * Defined once here (RULES #13). `*Data` = data loaded from JSON; the app maps it to its own model.
 * Runtime checks: `shared/guards/game-config.ts`.
 */

export const ENTRY_CATEGORIES = ["glossary", "videos", "texts", "links"] as const;
export type EntryCategory = (typeof ENTRY_CATEGORIES)[number];

/** Entity types the app can render in A-Frame (extensible, RULES #7). */
export const ENTITY_TYPES = ["model", "video", "image", "link"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ASSET_TYPES = ["glb", "gltf", "video", "image", "audio"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export interface ConfigurationVersion {
  version: string;
  timestamp: string; // when the content build inputs last changed
  hash?: string; // checksum of the content build inputs
}

export interface BookData {
  id: string; // e.g. "osct" – identifies the book (storage keys, QR codes)
  title: string;
  author: string;
}

export interface SpreadData {
  id: string;
  title: string;
  firstPage: number;
  lastPage: number;
  mindSrc: string; // compiled MindAR targets of this spread
}

export interface AssetData {
  id: string; // unique per scene, referenced by entities (`#id`)
  assetType: AssetType;
  src: string;
}

/** Description of an A-Frame entity projected on a found target. */
export interface EntityData {
  type: EntityType;
  assets: AssetData[]; // empty for `link` (renders the entry title)
  params?: Record<string, unknown>;
}

/** Reference to a shared entity in `GameConfiguration.entities`. */
export interface EntityRefData {
  ref: string;
}

export interface TargetData {
  id: string; // defaults to the entry id
  index: number; // position in the spread's .mind file (MindAR targetIndex)
  imageSrc: string;
  entity?: EntityData | EntityRefData;
}

export interface EntryData {
  id: string;
  category: EntryCategory;
  title: string;
  page: number; // access page – decides the spread
  body: string;
  author?: string; // texts
  image?: string;
  media?: string; // links: external URL
  tags: string[];
  target?: TargetData;
}

export interface StepData {
  id: string;
  index: number;
  title: string;
  description: string;
  illustration?: string;
}

export interface GameConfiguration {
  version: ConfigurationVersion;
  book: BookData;
  maxTargetsPerSpread: number;
  initialSpreadId: string;
  spreads: readonly SpreadData[];
  entries: readonly EntryData[];
  entities: Readonly<Record<string, EntityData>>; // shared entities, referenced by `EntityRefData`
  tutorial: readonly StepData[];
}
