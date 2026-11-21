import { scenes } from "./scenes.svelte";
import { selection } from "./selection.svelte";
import { putTarget } from "./api";
import { addSurface, arrangeInRow, inRow, liesOn, moveSurface, moveToSurface, onSurface, removalWarning, removeSurface, type MovedHow, type SurfacePreset } from "./surface-edit";

/**
 * The surface edits as the Tree's Surfaces level and the selected surface run them (#314, #337) –
 * one place, so the three never diverge: each writes the scene's whole list (`PUT …/scenes/{id}`) and selects what it
 * made. The rules are `surface-edit.ts`.
 */

/** Add a preset's surface to a scene and select it; its id (null: the scene is not loaded) */
export const addSceneSurface = async (sceneId: string, preset: SurfacePreset): Promise<string | null> => {
  const scene = scenes.scene(sceneId);
  if (!scene) return null;
  const { surfaces, added } = addSurface(preset, scene.surfaces);
  await scenes.putScene(sceneId, { surfaces });
  selection.selectSurface(sceneId, added.id);
  return added.id;
};

/** A surface one place earlier (−1) or later (+1) */
export const moveSceneSurface = async (sceneId: string, surfaceId: string, direction: -1 | 1): Promise<void> => {
  const surfaces = scenes.scene(sceneId)?.surfaces ?? [];
  const next = moveSurface(surfaces, surfaceId, direction);
  if (next.some((s, i) => s.id !== surfaces[i]?.id)) await scenes.putScene(sceneId, { surfaces: next });
};

/**
 * **Arrange in a row** (#319): the scene's surfaces side by side in their order, flat, touching, the row centred on the
 * origin – written to their places; nothing written when they lie so already
 */
export const arrangeSceneInRow = async (sceneId: string): Promise<void> => {
  const surfaces = scenes.scene(sceneId)?.surfaces ?? [];
  if (surfaces.length && !inRow(surfaces)) await scenes.putScene(sceneId, { surfaces: arrangeInRow(surfaces) });
};

/** Whether *arrange in a row* would change the scene (the command is off otherwise) */
export const canArrangeInRow = (sceneId: string): boolean => {
  const surfaces = scenes.scene(sceneId)?.surfaces ?? [];
  return surfaces.length > 0 && !inRow(surfaces);
};

/** What lies on a surface, as its removal's confirmation says it ("" = nothing) */
export const surfaceRemovalWarning = (sceneId: string, surfaceId: string): string => {
  const scene = scenes.scene(sceneId);
  const surface = scene?.surfaces?.find(s => s.id === surfaceId);
  if (!scene || !surface) return "";
  return removalWarning(onSurface(scene.entries.map(e => ({ id: e.id, title: e.title, surface: e.surface, target: e.target ? { id: e.target.id, place: e.target.place } : null })), surface, scene.surfaces));
};

/**
 * **Move a target to another surface** of its scene (#314 – the Tree's Surfaces level, a drag or a row's menu): its place
 * as `moveToSurface` says (kept where it fits, else centred, made smaller when it is too big), written at once
 * (`PUT …/targets/{id}`). `height` = the print's height from the stage when its place has none. How it came there, or
 * null when nothing was written (already there, no place, unknown).
 */
export const moveTargetToSurface = async (sceneId: string, targetId: string, surfaceId: string, height?: number): Promise<MovedHow | null> => {
  const scene = scenes.scene(sceneId);
  const surface = scene?.surfaces.find(s => s.id === surfaceId);
  const place = scene?.entries.find(e => e.target?.id === targetId)?.target?.place;
  if (!scenes.experienceId || !scene || !surface || !place || liesOn(place, surface, scene.surfaces)) return null;
  const moved = moveToSurface(place, surface, scene.surfaces.length > 1, height);
  await putTarget(scenes.experienceId, targetId, { place: moved.place });
  return moved.how;
};

/** Remove a surface (the confirmation was shown); what lay on it falls back to the first surface. A selected surface leaves the selection. */
export const removeSceneSurface = async (sceneId: string, surfaceId: string): Promise<void> => {
  const surfaces = scenes.scene(sceneId)?.surfaces ?? [];
  await scenes.putScene(sceneId, { surfaces: removeSurface(surfaces, surfaceId), apply: true });
  if (selection.surface?.scene === sceneId && selection.surface.id === surfaceId) selection.clear();
};
