import { getExperience, getPlugins, getScenes, loadGameConfiguration } from "@engine/content/game-config";
import { layoutFileUrl } from "@engine/content/layout";
import { extractLandingHero, landingCover, landingImages } from "@shared/api/landing-extract";
import { layoutSheets } from "../utils/book-cover";
import type { LandingData } from "@ui/landing/data";
import { LANDING_CONFIG } from "@ui/landing/landing-config";
import { scanStagePick } from "@ui/landing/scan-stage-data";

export interface DeriveOptions {
  /** The experience's content base URL; "" = the bundled configuration (`bundled`) */
  baseUrl: string;
  bundled: () => Promise<unknown>;
  fetch?: typeof globalThis.fetch;
}

/**
 * The landing's data from the experience's game configuration (#355) – while a content version has no `landing.json`
 * (a version published before publish wrote it). Loads the configuration with the engine's loader (not the app's) and
 * extracts the hero as publish would (`shared/api/landing-extract.ts`): the experience's pick (`experience.landing`),
 * else the scene and model of the first of `LANDING_CONFIG.scanEntries` that has a model, else the content's first
 * model; the print layout's sheets from the loaded content (`utils/book-cover.ts`). Loaded lazily: only the fallback
 * needs the configuration's guard.
 */
export const deriveLandingData = async ({ baseUrl, bundled, fetch }: DeriveOptions): Promise<LandingData> => {
  const error = await loadGameConfiguration({ baseUrl, bundled, fetch });
  if (error) throw new Error(`${error.code}: ${error.details?.[0] ?? error.msg}`);
  const experience = getExperience();
  const appearance = experience.appearance;
  const source = { scenes: getScenes(), plugins: getPlugins(), ...(appearance ? { appearance } : {}) };
  const pick = scanStagePick(source, LANDING_CONFIG.scanEntries, experience.landing);
  const layout = { sheets: await layoutSheets(), url: layoutFileUrl };
  return {
    experience: experience.id,
    title: experience.title,
    author: experience.book?.author ?? "",
    publisher: experience.book?.publisher ?? "",
    images: landingImages(source),
    cover: landingCover(layout),
    hero: pick && extractLandingHero(source, pick, layout),
    shop: LANDING_CONFIG.shop,
  };
};
