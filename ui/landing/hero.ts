import type { LandingHeroData } from "@shared/api/landing";
import { ScanStage } from "./scan-stage";

/**
 * The hero's scan stage (#354) from the landing's data (#355): three.js, the engine's model loading and the experience's
 * plugins – the `three` chunk and this one are loaded only once the page is up (`mount.ts`). Resolves once the stage
 * runs; without WebGL the constructor throws and the stage stays its quiet glow. `markSrc`: the brand's mark on the
 * phone (`ui/brand/marks.ts` – given by the page, so the hero's chunk carries no module of its own for it).
 */
export const startHero = async (box: HTMLElement, hero: LandingHeroData, book: { title: string; author: string; cover: string | null }, markSrc: string): Promise<ScanStage> => {
  const stage = new ScanStage(box, hero, {
    sheets: Promise.resolve({ cover: book.cover, spread: hero.spread, earlier: hero.earlier }),
    title: book.title,
    author: book.author,
    markSrc,
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
