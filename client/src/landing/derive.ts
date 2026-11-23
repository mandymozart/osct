import { getExperience, getPlugins, getScenes, loadGameConfiguration } from "@engine/content/game-config";
import { bookCoverUrl, sheetUrl, spreadSheets } from "../utils/book-cover";
import type { LandingData } from "./data";
import { LANDING_CONFIG } from "./landing-config";
import { pick } from "./landing-html";
import { scanStageData } from "./scan-stage-data";

export interface DeriveOptions {
  /** The experience's content base URL; "" = the bundled configuration (`bundled`) */
  baseUrl: string;
  bundled: () => Promise<unknown>;
  fetch?: typeof globalThis.fetch;
}

/**
 * The landing's data from the experience's game configuration (#355) – while a content version has no `landing.json`
 * (publish writes it from the next step on). Loads the configuration with the engine's loader (not the app's) and picks
 * the hero as the landing always did: the scene and model of the first of `LANDING_CONFIG.scanEntries` that has a model,
 * else the content's first model (`scanStageData`), the print layout's sheets (`utils/book-cover.ts`). Loaded lazily:
 * only the fallback needs the configuration's guard.
 */
export const deriveLandingData = async ({ baseUrl, bundled, fetch }: DeriveOptions): Promise<LandingData> => {
  const error = await loadGameConfiguration({ baseUrl, bundled, fetch });
  if (error) throw new Error(`${error.code}: ${error.details?.[0] ?? error.msg}`);
  const experience = getExperience();
  const scenes = getScenes();
  const images = scenes.flatMap(scene => scene.targets.map(target => target.imageSrc));
  const stage = scanStageData(scenes, LANDING_CONFIG.scanEntries);
  const [cover, found] = await Promise.all([bookCoverUrl(), stage ? spreadSheets(stage.pages, 3) : null]);
  const prints = new Set(stage?.prints.map(print => print.src));
  return {
    experience: experience.id,
    title: experience.title,
    author: experience.book?.author ?? "",
    publisher: experience.book?.publisher ?? "",
    images,
    cover,
    hero: stage && {
      ...stage,
      spread: found ? sheetUrl(found.spread) : null,
      earlier: (found?.earlier ?? []).map(sheetUrl).filter((src): src is string => !!src),
      pageImages: pick(images.filter(src => !prints.has(src)), 6, 354),
      plugins: getPlugins(),
      ...(experience.appearance ? { appearance: experience.appearance } : {}),
    },
    shop: LANDING_CONFIG.shop,
  };
};
