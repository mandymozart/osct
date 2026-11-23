import type { LandingHeroData } from "@shared/api/landing";
import { ONBOARDING_ICON_SRC } from "../utils/static-splash-html";
import { ScanStage } from "./scan-stage";

/**
 * The hero's scan stage (#354) from the landing's data (#355): three.js, the engine's model loading and the experience's
 * plugins – the `three` chunk and this one are loaded only once the page is up (`mount.ts`). Resolves once the stage
 * runs; without WebGL the constructor throws and the stage stays its quiet glow.
 */
export const startHero = async (box: HTMLElement, hero: LandingHeroData, book: { title: string; author: string; cover: string | null }): Promise<ScanStage> => {
  const stage = new ScanStage(box, hero, {
    sheets: Promise.resolve({ cover: book.cover, spread: hero.spread, earlier: hero.earlier }),
    title: book.title,
    author: book.author,
    markSrc: ONBOARDING_ICON_SRC,
    pageImages: hero.pageImages,
    plugins: hero.plugins,
    appearance: hero.appearance,
  });
  try {
    await stage.load();
  } catch (error) {
    stage.stop();
    throw error;
  }
  return stage;
};
