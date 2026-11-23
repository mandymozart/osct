/**
 * The experience's landing (content schema 6.1, #355): the one target with AR content (a model, a video, a component –
 * Tilman: "or video or component. marginalia and links wouldnt work") on one surface of one scene that the desktop
 * landing's hero shows – Tilman, 2026-11-23: "the landing page hero needs only a specific target on a surface
 * on a scene to show of how they work. so that data can be extracted in the editor to fill in the data needed to build the
 * landing page." The person picks it in the editor; the editor (and the content build, and the MCP server) extracts the
 * hero from it and stores both (`ExperienceData.landing`), so publish writes `landing.json` from the stored data and
 * nobody traverses the scenes for it again (`shared/api/landing-extract.ts`; the file: `shared/api/landing.ts`).
 *
 * Units of the hero: the surface's width is 1, its centre the origin, x → right, y → the top of the page (as the
 * engine's placement, `./placement.ts`).
 */
import { isObject } from "../guards/primitives";
import type { ExperienceAppearance } from "./appearance";
import type { EntityData } from "./game-config";
import type { PluginData } from "./plugins";

/**
 * A printed image on the hero's open book. Units: the surface's width is 1, its centre the origin, x → right, y → the
 * top of the page (as the engine's placement)
 */
export interface LandingPrintData {
  src: string;
  /** Its centre across, in surface widths */
  x: number;
  /** Its top edge, up from the surface's centre; null = centred (a target without a place) */
  top: number | null;
  width: number;
  /** In surface widths; none = from the image's proportions */
  height?: number;
}

/** The hero: the book open on one surface of one scene, the target with its AR content on it, and how that appears */
export interface LandingHeroData {
  /** The surface's height in surface widths (a 460 × 320 mm spread: 0.696) */
  aspect: number;
  /** The printed page numbers the surface shows (its sheet in the print layout) */
  pages: number[];
  /** The surface's printed images where they lie */
  prints: LandingPrintData[];
  /** The target that holds the AR content */
  target: LandingPrintData;
  /**
   * The target's entity as the configuration has it – its node tree, components and files: a model, a video (keyed or
   * not), a plugin's node type, a node a component drives. The hero builds it with the engine, as the reader does.
   */
  entity: EntityData;
  /** The print layout's picture of the surface and of the spreads before it (nearest last); null / [] without a layout */
  spread: string | null;
  earlier: string[];
  /** Other printed images of the book, for turning pages without a picture of their own */
  pageImages: string[];
  /** The experience's plugins (their looks play on reveal, found and lost) and its own looks */
  plugins: PluginData[];
  appearance?: ExperienceAppearance;
}

/** A scene and one of its targets, by id – the target lies on one surface of that scene, which is the hero's surface */
export interface LandingPick {
  scene: string;
  target: string;
}

/**
 * `ExperienceData.landing` (schema 6.1): the pick, and what was extracted from it when it was picked – `hero` and the
 * print layout's front `cover` (none: the layout has none). An author writes `scene` and `target` only; the editor and
 * the content build fill the rest. An app before 6.1 ignores the field.
 */
export interface ExperienceLanding extends LandingPick {
  hero?: LandingHeroData;
  cover?: string;
}

/** Problems of an `experience.landing` as "<path>: <message>" – its shape; whether the pick exists is the build's and the API's check */
export const experienceLandingProblems = (value: unknown, path = "experience.landing"): string[] => {
  if (!isObject(value)) return [`${path}: expected { scene, target }`];
  const problems: string[] = [];
  for (const key of ["scene", "target"] as const) {
    if (typeof value[key] !== "string" || value[key] === "") problems.push(`${path}.${key}: expected an id`);
  }
  if (value.hero !== undefined && !isObject(value.hero)) problems.push(`${path}.hero: expected the extracted hero (an object)`);
  if (value.cover !== undefined && typeof value.cover !== "string") problems.push(`${path}.cover: expected a path or URL`);
  return problems;
};
