import type { GameConfiguration } from "@engine/types";
import { extractDraftLanding } from "@shared/api/landing-draft";
import { landingContentProblem, landingSourceOf } from "@shared/api/landing-extract";
import { type ExperienceLanding, landingExtrasOf, landingPickOf, type LandingPick } from "@shared/types/landing";
import { getDraftFile, getDraftManifest, getExperience, putExperience } from "./api";
import { autosave } from "./autosave.svelte";

/**
 * The landing's hero picked in the editor (#355): a target with AR content (a model, a video, a component) on a scene – the stage's target menu ("Use
 * for the landing page") and the experience's Inspector (its Landing page section: refresh, remove). The hero is
 * extracted from the draft as it is saved now (`shared/api/landing-draft.ts`, the same extractor the content build, the
 * MCP server and the reader's fallback run) and stored in the experience (`experience.landing`, content schema 6.1) –
 * publish writes the version's `landing.json` from it.
 */

/**
 * The pick with its hero, extracted from the draft now – or why it cannot be the hero. The landing's texts and shop (#365)
 * come along as the draft holds them now, so a new pick keeps them.
 */
export const extractLanding = async (experienceId: string, pick: LandingPick): Promise<{ landing: ExperienceLanding } | { problem: string }> => {
  const [{ experience }, manifest] = await Promise.all([getExperience(experienceId), getDraftManifest(experienceId)]);
  const [configuration, files] = await Promise.all([
    getDraftFile<GameConfiguration>(experienceId, manifest.build, "game.config.json"),
    getDraftFile<Record<string, unknown>>(experienceId, manifest.build, "files.json"),
  ]);
  // The layout is a public file of the import (its assets base): read without the session
  const result = await extractDraftLanding({ configuration, files, assetsBase: experience.assetsBase, fetch: (input, init) => fetch(input, init) }, pick);
  return "landing" in result ? { landing: { ...result.landing, ...landingExtrasOf(configuration.experience.landing) } } : result;
};

/** The autosaver's key of an experience's landing: every save of the pick, a refresh and a removal queue under it */
export const landingSaveKey = (experienceId: string): string => `experience:${experienceId}:landing`;

/**
 * A new pick saved like any edit (RULES #37): its hero extracted from the draft when the save runs (after the edits
 * waiting before it) and stored in the experience; History shows it. A pick that cannot be the hero fails the save with
 * why. `onsaved` gets what was stored – the stage's target menu, the landing workspace's selects and its Scenes panel.
 */
export const saveLandingPick = (experienceId: string, pick: LandingPick, onsaved?: (landing: ExperienceLanding) => void): void =>
  autosave.queue(landingSaveKey(experienceId), async () => {
    const result = await extractLanding(experienceId, pick);
    if ("problem" in result) throw new Error(`Landing page: ${result.problem}`);
    await putExperience(experienceId, { landing: result.landing });
    onsaved?.(result.landing);
  });

/**
 * The landing as the workspace holds it, saved like any edit (RULES #37) – its texts, its shop, its pick (#365): one
 * subject, so the saves of the pick and of the texts never overtake each other. The save writes what `current()` holds
 * when it runs; a pick without its hero yet (just chosen) has it extracted from the draft first. A landing that holds
 * nothing is removed (`null`). `onsaved` gets what was stored.
 */
export const saveLanding = (experienceId: string, current: () => ExperienceLanding | null, onsaved?: (landing: ExperienceLanding | null) => void): void =>
  autosave.queue(landingSaveKey(experienceId), async () => {
    let landing = current();
    const pick = landingPickOf(landing);
    if (pick && !landing?.hero) {
      const result = await extractLanding(experienceId, pick);
      if ("problem" in result) throw new Error(`Landing page: ${result.problem}`);
      landing = { ...heroOf(result.landing), ...landingExtrasOf(current()) };
    }
    const stored = landing && (landingPickOf(landing) || landing.texts !== undefined || landing.shop !== undefined) ? landing : null;
    await putExperience(experienceId, { landing: stored });
    onsaved?.(stored);
  });

/** The pick and what was extracted from it – the landing without its texts and shop */
export const heroOf = (landing: ExperienceLanding): ExperienceLanding => {
  const { texts: _texts, shop: _shop, ...hero } = landing;
  return hero;
};

/** The landing without its pick (Remove): its texts and shop stay; nothing left – null */
export const withoutLandingPick = (landing: ExperienceLanding | null): ExperienceLanding | null => {
  const extras = landingExtrasOf(landing);
  return Object.keys(extras).length ? extras : null;
};

/** What the Inspector names a pick by: its scene's label and its target's id – "scene › target" */
export const landingPickLabel = (pick: LandingPick, sceneLabel?: string): string => `${sceneLabel || pick.scene} › ${pick.target}`;

/** A scene the landing's hero can be on: its targets with AR content, in entry order */
export interface LandingPickScene {
  id: string;
  label: string;
  targets: string[];
}

/**
 * What the landing workspace's pick offers (#356): every scene with at least one target that has AR content (a model, a
 * video, a component – `landingContentProblem`), and only those targets; switched-off targets are left out as the reader
 * leaves them out. Marginalia and links never appear.
 */
export const landingPickScenes = (configuration: Pick<GameConfiguration, "experience" | "scenes" | "entries" | "entities" | "plugins">): LandingPickScene[] =>
  landingSourceOf(configuration).scenes
    .map(scene => ({ id: scene.id, label: scene.label, targets: scene.targets.filter(target => !landingContentProblem(target.entity)).map(target => target.id) }))
    .filter(scene => scene.targets.length > 0);
