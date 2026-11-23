import type { GameConfiguration } from "@engine/types";
import { draftFileUrl, draftLayout } from "@shared/api/landing-draft";
import { landingFileOf } from "@shared/api/landing-extract";
import type { LandingFile } from "@shared/api/landing";
import { type LandingData, landingDataFromFile } from "@ui/landing/data";
import { getDraftFile, getDraftManifest, getExperience } from "./api";

/** What the landing workspace shows (#356): the page's data from the draft, and the draft's configuration it came from */
export interface DraftLanding {
  data: LandingData;
  /** The draft's configuration (every content path below the import's assets base): the pick's choices are made from it */
  configuration: GameConfiguration;
}

/** What `draftLandingData` reads: the draft's configuration and files.json, the experience's assets base, its layout's reader */
export interface DraftLandingSource {
  configuration: GameConfiguration;
  files: Record<string, unknown>;
  assetsBase: string;
  fetch: typeof globalThis.fetch;
}

/**
 * The landing's data as the draft would publish it: the `landing.json` publish writes (`landingFileOf` – the stored hero
 * of `experience.landing` when there is one, else the hero extracted from the pick or the default), its content paths
 * resolved where the draft keeps those files (`draftFileUrl`: an earlier build's folder, else below the assets base).
 * Pure but for the layout's read.
 */
export const draftLandingData = async ({ configuration, files, assetsBase, fetch }: DraftLandingSource): Promise<LandingData> => {
  const layout = await draftLayout(files, assetsBase, fetch);
  const file: LandingFile = landingFileOf(configuration, layout);
  const keys = Object.keys(files);
  return landingDataFromFile(file, path => draftFileUrl(keys, assetsBase, path) ?? path);
};

/** The experience's draft as the landing page shows it – read again on every call (the workspace follows each save) */
export const loadDraftLanding = async (experienceId: string): Promise<DraftLanding> => {
  const [{ experience }, manifest] = await Promise.all([getExperience(experienceId), getDraftManifest(experienceId)]);
  const [configuration, files] = await Promise.all([
    getDraftFile<GameConfiguration>(experienceId, manifest.build, "game.config.json"),
    getDraftFile<Record<string, unknown>>(experienceId, manifest.build, "files.json"),
  ]);
  // The layout is a public file of the import (its assets base): read without the session
  const data = await draftLandingData({ configuration, files, assetsBase: experience.assetsBase, fetch: (input, init) => fetch(input, init) });
  return { data, configuration };
};
