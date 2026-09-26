/**
 * Game configuration contract – the shape of `game.config.json`.
 *
 * Written by the content build (`scripts/`), read by the app (`client/src/utils/game-config.ts`).
 * Defined once here (RULES #13). `*Data` = data loaded from JSON; the app maps it to its own model.
 * Runtime checks: `shared/guards/game-config.ts`.
 */

import { EntryCategory } from "./entry";
import { FilterData } from "./filters";

export * from "./filters";

/** Entity types the app can render in A-Frame (extensible, RULES #7). */
export const ENTITY_TYPES = ["model", "video", "image"] as const; // "link" dropped 2026-09-25 (links are entries)
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
  /** Shown on the home page above "Start" (optional) */
  publisher?: string;
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
  filters?: FilterData[]; // video only, applied in order (see ./filters.ts)
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

/** What a tutorial step's button does (onboarding, design p.1–5) */
export const STEP_ACTIONS = ["next", "camera", "scan"] as const;
export type StepAction = (typeof STEP_ACTIONS)[number];

/**
 * Onboarding / tutorial step (design p.1–5). Without `button` the step advances by itself after
 * `advance` ms (or on tap). `description` may use `*emphasis*` and blank lines for paragraphs.
 */
export interface StepData {
  id: string;
  index: number;
  title?: string;
  description?: string;
  /** Small line near the bottom (e.g. the publisher) */
  footer?: string;
  illustration?: string;
  /** Button label; with `action` (default `next`) */
  button?: string;
  action?: StepAction;
  /** Fade-in duration of the step's parts (ms; default in the app) – design: 1s on the title step */
  fadeIn?: number;
  /** Delay between its parts fading in one after the other (ms). Set on the splash: Mark, then title,
   *  author and publisher. Without it the parts follow with a short default delay and Mark stays still. */
  stagger?: number;
  /** Auto-advance after ms (steps without button) */
  advance?: number;
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
