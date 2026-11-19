import { isPassEnabled, type PassData } from "@engine/types";
import { passOptionLabels, passValue, sameValue, type ValueRow } from "./values";

/**
 * The post-processing panel's model: the experience's passes are the master every scene shows; a
 * scene's own list overrides them (`[]` = off there). The panel edits both at once – the experience's list and the scene's
 * own (`null` = it uses the experience's) – and compares them with the draft to know what a save writes. Pure, for the tests.
 */
export interface PassesDraft {
  experience: PassData[];
  own: PassData[] | null;
}

/** Which list a scene shows */
export type PassesSource = "experience" | "scene";

const copy = (passes: readonly PassData[]): PassData[] => passes.map(pass => ({ ...pass }));

export const samePasses = (a: readonly PassData[] | null, b: readonly PassData[] | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The draft's lists as the panel starts from them (copies – the panel never edits the loaded content) */
export const draftPasses = (experience: readonly PassData[] | null | undefined, own: readonly PassData[] | null | undefined): PassesDraft => ({
  experience: copy(experience ?? []),
  own: own ? copy(own) : null,
});

export const passesSource = (draft: PassesDraft): PassesSource => (draft.own === null ? "experience" : "scene");

/** The passes the scene shows (the list in effect) – what the panel lists and the stage previews */
export const effectivePasses = (draft: PassesDraft): PassData[] => draft.own ?? draft.experience;

/**
 * The section's head (#181): the level in words – "post-processing · the whole experience" / "· only this scene" –, and
 * "· off" for an empty list of the scene's own, "· none" while the experience holds none, "· all off" while every pass is
 * switched off (#233)
 */
export const passesHeading = (draft: PassesDraft): string => {
  const list = effectivePasses(draft);
  const level = draft.own === null ? "the whole experience" : "only this scene";
  const state = list.length ? (list.some(isPassEnabled) ? "" : " · all off") : draft.own === null ? " · none" : " · off";
  return `post-processing · ${level}${state}`;
};

/**
 * How many scenes use the experience's passes (no list of their own) – the draft's, with the scene on the stage as the
 * panel holds it now (`own`: its unsaved choice)
 */
export const scenesOnExperience = (
  scenes: readonly { id: string; passes?: readonly PassData[] | null }[], sceneId: string, own: readonly PassData[] | null,
): number => scenes.filter(scene => (scene.id === sceneId ? own === null : !scene.passes)).length;

/** The line under the head: what editing the list changes – the experience's for N scenes, or this scene's override */
export const levelLine = (draft: PassesDraft, scenes: number): string =>
  draft.own !== null ? "overrides the experience's for this scene"
    : scenes === 1 ? "changes the 1 scene that uses the experience's" : `changes all ${scenes} scenes that use the experience's`;


/** *Own passes for this scene*: the override starts as a copy of the experience's */
export const ownPasses = (draft: PassesDraft): PassesDraft => ({ ...draft, own: copy(draft.experience) });

/** *Back to the experience's*: the override goes */
export const backToExperience = (draft: PassesDraft): PassesDraft => ({ ...draft, own: null });

/** The list with the pass at `index` moved by `by` places (−1 up, +1 down); a move past an end leaves it as it is */
export const movePass = (list: readonly PassData[], index: number, by: number): PassData[] => {
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [pass] = next.splice(index, 1);
  next.splice(to, 0, pass);
  return next;
};

/**
 * The pass at `index` on or off (#233): off is `enabled: false` – the pass keeps its place and values, the chain skips it;
 * on drops the field (a pass runs unless it says otherwise)
 */
export const setPassEnabled = (list: readonly PassData[], index: number, on: boolean): PassData[] =>
  list.map((pass, i) => {
    if (i !== index) return pass;
    const { enabled: _, ...rest } = pass;
    return on ? (rest as PassData) : { ...rest, enabled: false };
  });

/** How many values a closed pass's head names */
const SUMMARY_VALUES = 2;

/**
 * The line a closed pass shows after its type (#233): the values set away from the default, at most two, as
 * "strength 0.35 · radius 0.6" – else its first parameter's value; nothing for a pass without parameters
 */
export const passSummary = (pass: PassData, rows: readonly ValueRow[]): string | undefined => {
  const words = (row: ValueRow) => {
    const value = passValue(pass, row);
    const shown = row.kind === "choice" ? passOptionLabels(pass, row)[String(value)] ?? String(value) : (row.kind === "texture" || row.kind === "model") && value === "" ? "none" : String(value);
    return `${row.label} ${shown}${row.unit && row.kind === "number" ? ` ${row.unit}` : ""}`;
  };
  const set = rows.filter(row => !sameValue(passValue(pass, row), row.default));
  const named = (set.length ? set : rows.slice(0, 1)).slice(0, SUMMARY_VALUES).map(words);
  return named.length ? named.join(" · ") : undefined;
};

/** A change to the list in effect: the scene's own, or – while it uses the experience's – the experience's (every scene without its own) */
export const editInEffect = (draft: PassesDraft, change: (list: PassData[]) => PassData[]): PassesDraft =>
  draft.own === null ? { ...draft, experience: change(draft.experience) } : { ...draft, own: change(draft.own) };

/**
 * What a save writes, only what changed: `experience` – the experience's list (`null` when it is empty: the experience holds none) for
 * `PUT …/passes`; `scene` – the scene's own (`null`: back to the experience's) for `PUT …/scenes/{id}`
 */
export const pendingSaves = (draft: PassesDraft, saved: PassesDraft): { experience?: PassData[] | null; scene?: PassData[] | null } => ({
  ...(samePasses(draft.experience, saved.experience) ? {} : { experience: draft.experience.length ? draft.experience : null }),
  ...(samePasses(draft.own, saved.own) ? {} : { scene: draft.own }),
});
