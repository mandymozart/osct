import { defaultLandingPick, findLandingPick, type LandingSource, type LandingStage } from "@shared/api/landing-extract";
import type { LandingPick, LandingPrintData } from "@shared/types/landing";

/**
 * What the landing's scan stage shows (#354): one scene of the book lying open, the target with its AR content on it
 * (a model, a video, a component – #355) – the hero's core (`LandingHeroData` without the layout's pictures, the
 * plugins and the looks).
 * Made by the one extractor of the landing (`shared/api/landing-extract.ts`, #355) – the editor, the content build, the
 * MCP server and the reader's fallback pick and measure the same way. Units: the surface's width is 1, its centre the
 * origin, x → right, y → the top of the page (as the engine's placement, `shared/types/placement.ts`).
 */
export type ScanStageData = LandingStage;
export type ScanPrint = LandingPrintData;

/**
 * The fallback's pick of the stage's scene and target: the experience's own (`experience.landing`) while it names a
 * target with AR content, else the first of `entryIds` (the book's 10/11 – `LANDING_CONFIG.scanEntries`) that holds a
 * model, else the first target with a model, else with a video (the test fixture offline); null: the content has neither
 */
export const scanStagePick = (source: LandingSource, entryIds: readonly string[], picked?: LandingPick | null): LandingPick | null => {
  const own = picked ? findLandingPick(source, picked) : null;
  return own && !("problem" in own) ? { scene: picked!.scene, target: picked!.target } : defaultLandingPick(source, entryIds);
};
