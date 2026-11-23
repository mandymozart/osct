import type { GameConfiguration } from "@engine/types";
import { draftFileUrl, draftLayout } from "@shared/api/landing-draft";
import { landingFileOf, type LandingLayout } from "@shared/api/landing-extract";
import type { ExperienceLanding } from "@shared/types/landing";
import type { LandingFile } from "@shared/api/landing";
import { type LandingData, landingDataFromFile } from "@ui/landing/data";
import { getDraftFile, getDraftManifest, getExperience } from "./api";

/** What the landing workspace shows (#356): the draft's configuration, files and print layout – the page's data is made from them */
export interface DraftLanding {
  /** The draft's configuration (every content path below the import's assets base): the pick's choices are made from it */
  configuration: GameConfiguration;
  files: Record<string, unknown>;
  assetsBase: string;
  /** The print layout of the import (none without one) */
  layout?: LandingLayout;
}

/** What `draftLandingData` reads: the draft's configuration and files.json, the experience's assets base, its layout's reader */
export interface DraftLandingSource {
  configuration: GameConfiguration;
  files: Record<string, unknown>;
  assetsBase: string;
  fetch: typeof globalThis.fetch;
}

/**
 * The landing's data as the draft would publish it with `landing` in place of the draft's own (the workspace's edits
 * before they are saved, #365 – none: the draft's): the `landing.json` publish writes (`landingFileOf` – the stored hero
 * when there is one, else the hero extracted from the pick or the default; the texts and the shop), its content paths
 * resolved where the draft keeps those files (`draftFileUrl`: an earlier build's folder, else below the assets base).
 */
export const landingDataOf = (draft: DraftLanding, landing?: ExperienceLanding | null): LandingData => {
  const configuration = landing === undefined ? draft.configuration : withLanding(draft.configuration, landing);
  const file: LandingFile = landingFileOf(configuration, draft.layout);
  const keys = Object.keys(draft.files);
  return landingDataFromFile(file, path => draftFileUrl(keys, draft.assetsBase, path) ?? path);
};

/** The configuration with another `experience.landing` (null: none) */
const withLanding = (configuration: GameConfiguration, landing: ExperienceLanding | null): GameConfiguration => {
  const { landing: _drafted, ...experience } = configuration.experience;
  return { ...configuration, experience: landing ? { ...experience, landing } : experience };
};

/** `landingDataOf` the draft as it is, its layout read first */
export const draftLandingData = async ({ configuration, files, assetsBase, fetch }: DraftLandingSource): Promise<LandingData> =>
  landingDataOf({ configuration, files, assetsBase, layout: await draftLayout(files, assetsBase, fetch) });

/** The experience's draft as the landing page shows it – read again on every call (the workspace follows each save) */
export const loadDraftLanding = async (experienceId: string): Promise<DraftLanding> => {
  const [{ experience }, manifest] = await Promise.all([getExperience(experienceId), getDraftManifest(experienceId)]);
  const [configuration, files] = await Promise.all([
    getDraftFile<GameConfiguration>(experienceId, manifest.build, "game.config.json"),
    getDraftFile<Record<string, unknown>>(experienceId, manifest.build, "files.json"),
  ]);
  // The layout is a public file of the import (its assets base): read without the session
  const layout = await draftLayout(files, experience.assetsBase, (input, init) => fetch(input, init));
  return { configuration, files, assetsBase: experience.assetsBase, ...(layout ? { layout } : {}) };
};
