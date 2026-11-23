import type { GameConfiguration } from "@engine/types";
import { extractDraftLanding } from "@shared/api/landing-draft";
import type { ExperienceLanding, LandingPick } from "@shared/types/landing";
import { getDraftFile, getDraftManifest, getExperience } from "./api";

/**
 * The landing's hero picked in the editor (#355): a target with AR content (a model, a video, a component) on a scene – the stage's target menu ("Use
 * for the landing page") and the experience's Inspector (its Landing page section: refresh, remove). The hero is
 * extracted from the draft as it is saved now (`shared/api/landing-draft.ts`, the same extractor the content build, the
 * MCP server and the reader's fallback run) and stored in the experience (`experience.landing`, content schema 6.1) –
 * publish writes the version's `landing.json` from it.
 */

/** The pick with its hero, extracted from the draft now – or why it cannot be the hero */
export const extractLanding = async (experienceId: string, pick: LandingPick): Promise<{ landing: ExperienceLanding } | { problem: string }> => {
  const [{ experience }, manifest] = await Promise.all([getExperience(experienceId), getDraftManifest(experienceId)]);
  const [configuration, files] = await Promise.all([
    getDraftFile<GameConfiguration>(experienceId, manifest.build, "game.config.json"),
    getDraftFile<Record<string, unknown>>(experienceId, manifest.build, "files.json"),
  ]);
  // The layout is a public file of the import (its assets base): read without the session
  return extractDraftLanding({ configuration, files, assetsBase: experience.assetsBase, fetch: (input, init) => fetch(input, init) }, pick);
};

/** What the Inspector names a pick by: its scene's label and its target's id – "scene › target" */
export const landingPickLabel = (pick: LandingPick, sceneLabel?: string): string => `${sceneLabel || pick.scene} › ${pick.target}`;
