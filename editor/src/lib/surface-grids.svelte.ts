import { readStoredJson, writeStoredJson, type StorageKey } from "./storage";
import { parseSurfaceGrid, updatePreview, type SurfaceGrid } from "./stage/preview";

/**
 * A surface's own grid (#316, #314): the grid the targets on one surface snap to and the stage draws on it – a wall's
 * poster grid, a page's type area – instead of the toolbar's: its spacing (mm), its subdivisions, on / off and snap
 * (`SurfaceGrid`; a field left out is the toolbar's). An editing aid, never content (#314's decision: it does not change
 * what a reader sees, so it stays in this browser): kept per experience and surface
 * (`osct-editor-surface-grids:<experience>` → `<scene>/<surface>` → the grid; a plain number, as stored before, is a
 * spacing). The open scene's grids go to the stage with the preview (`surfaceGrids`, `stage/preview.ts`).
 */

const keyOf = (experienceId: string): StorageKey => `osct-editor-surface-grids:${experienceId}`;

/** The stored grids of an experience, by `<scene>/<surface>`; anything that is no grid is left out, the numbers clamped */
export const readSurfaceGrids = (experienceId: string): Record<string, SurfaceGrid> => {
  const stored = readStoredJson(keyOf(experienceId));
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>)
      .filter(([key]) => key.includes("/"))
      .map(([key, value]) => [key, parseSurfaceGrid(value)] as const)
      .filter((entry): entry is readonly [string, SurfaceGrid] => entry[1] !== null),
  );
};

/** One scene's grids by surface id */
export const sceneSurfaceGrids = (all: Readonly<Record<string, SurfaceGrid>>, sceneId: string): Record<string, SurfaceGrid> =>
  Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith(`${sceneId}/`)).map(([key, grid]) => [key.slice(sceneId.length + 1), grid]));

/** What a change of one surface's grid sends: a field set, or `null` – back to the toolbar's */
export type SurfaceGridPatch = { [K in keyof SurfaceGrid]?: SurfaceGrid[K] | null };

/**
 * The grids with one surface's changed: the patch's fields set (checked and clamped), a `null` field back to the
 * toolbar's; `null` for the whole patch drops the surface's grid. A grid left with no field goes.
 */
export const withSurfaceGrid = (all: Readonly<Record<string, SurfaceGrid>>, sceneId: string, surfaceId: string, patch: SurfaceGridPatch | null): Record<string, SurfaceGrid> => {
  const key = `${sceneId}/${surfaceId}`;
  const { [key]: old, ...rest } = all;
  if (patch === null) return rest;
  const merged: Record<string, unknown> = { ...(old ?? {}) };
  for (const [field, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete merged[field];
    else merged[field] = value;
  }
  const grid = parseSurfaceGrid(merged);
  return grid ? { ...rest, [key]: grid } : rest;
};

/** The open experience's surface grids: read once per experience, written on a change, the open scene's handed to the stage */
class SurfaceGrids {
  experienceId = $state<string | null>(null);
  sceneId = $state<string | null>(null);
  all = $state<Record<string, SurfaceGrid>>({});

  /** The open experience and scene: the stage gets that scene's grids */
  enter(experienceId: string, sceneId: string): void {
    if (this.experienceId !== experienceId) {
      this.experienceId = experienceId;
      this.all = readSurfaceGrids(experienceId);
    }
    this.sceneId = sceneId;
    this.publish();
  }

  /** A surface's own grid (its fields; the others are the toolbar's), null when it has none */
  of(sceneId: string, surfaceId: string): SurfaceGrid | null {
    return this.all[`${sceneId}/${surfaceId}`] ?? null;
  }

  /** Change a surface's own grid (`withSurfaceGrid`; `null` drops it) */
  set(sceneId: string, surfaceId: string, patch: SurfaceGridPatch | null): void {
    if (!this.experienceId) return;
    this.all = withSurfaceGrid(this.all, sceneId, surfaceId, patch);
    writeStoredJson(keyOf(this.experienceId), this.all);
    this.publish();
  }

  private publish(): void {
    updatePreview({ surfaceGrids: this.sceneId ? sceneSurfaceGrids(this.all, this.sceneId) : {} });
  }
}

export const surfaceGrids = new SurfaceGrids();
