import { scenes } from "./scenes.svelte";
import { selection } from "./selection.svelte";
import { addSurface, moveSurface, onSurface, pageSizeOf, removalWarning, removeSurface, type SurfacePreset } from "./surface-edit";

/**
 * The surface edits as the Tree's Surfaces level, the Inspector's surfaces and the selected surface run them (#314) –
 * one place, so the three never diverge: each writes the scene's whole list (`PUT …/scenes/{id}`) and selects what it
 * made. The rules are `surface-edit.ts`.
 */

/** Add a preset's surface to a scene and select it; its id (null: the scene is not loaded) */
export const addSceneSurface = async (sceneId: string, preset: SurfacePreset, page: { width: number; height: number }): Promise<string | null> => {
  const scene = scenes.scene(sceneId);
  if (!scene) return null;
  const { surfaces, added, layout } = addSurface(preset, scene.surfaces ?? [], { page: pageSizeOf(scene.surfaces, page), layout: scene.layout });
  await scenes.putScene(sceneId, { surfaces, ...(layout ? { layout } : {}) });
  selection.selectSurface(sceneId, added.id);
  return added.id;
};

/** A surface one place earlier (−1) or later (+1) */
export const moveSceneSurface = async (sceneId: string, surfaceId: string, direction: -1 | 1): Promise<void> => {
  const surfaces = scenes.scene(sceneId)?.surfaces ?? [];
  const next = moveSurface(surfaces, surfaceId, direction);
  if (next.some((s, i) => s.id !== surfaces[i]?.id)) await scenes.putScene(sceneId, { surfaces: next });
};

/** What lies on a surface, as its removal's confirmation says it ("" = nothing) */
export const surfaceRemovalWarning = (sceneId: string, surfaceId: string): string => {
  const scene = scenes.scene(sceneId);
  const surface = scene?.surfaces?.find(s => s.id === surfaceId);
  if (!scene || !surface) return "";
  return removalWarning(onSurface(scene.entries.map(e => ({ id: e.id, title: e.title, surface: e.surface, target: e.target ? { id: e.target.id, print: e.target.print } : null })), surface, scene.surfaces ?? []));
};

/** Remove a surface (the confirmation was shown); what lay on it keeps its side. A selected surface leaves the selection. */
export const removeSceneSurface = async (sceneId: string, surfaceId: string): Promise<void> => {
  const surfaces = scenes.scene(sceneId)?.surfaces ?? [];
  await scenes.putScene(sceneId, { surfaces: removeSurface(surfaces, surfaceId), apply: true });
  if (selection.surface?.scene === sceneId && selection.surface.id === surfaceId) selection.clear();
};
