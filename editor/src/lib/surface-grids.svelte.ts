import { readStoredJson, writeStoredJson, type StorageKey } from "./storage";
import { clampGrid, updatePreview } from "./stage/preview";

/**
 * A surface's own grid (#316 part 1): the spacing (mm) of the grid the targets on one surface snap to and the stage
 * draws on it – a wall's poster grid, a page's type area – instead of the toolbar's grid spacing. Editor-side, never in
 * the content: kept in this browser per book and surface (`osct-editor-surface-grids:<book>` → `<scene>/<surface>` →
 * mm). The open scene's spacings go to the stage with the preview (`surfaceGrids`, `stage/preview.ts`).
 */

const keyOf = (bookId: string): StorageKey => `osct-editor-surface-grids:${bookId}`;

/** The stored spacings of a book, by `<scene>/<surface>`; anything that is no spacing is left out */
export const readSurfaceGrids = (bookId: string): Record<string, number> => {
  const stored = readStoredJson(keyOf(bookId));
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>)
      .filter(([key, mm]) => key.includes("/") && typeof mm === "number" && Number.isFinite(mm))
      .map(([key, mm]) => [key, clampGrid(mm as number)]),
  );
};

/** One scene's spacings by surface id */
export const sceneSurfaceGrids = (all: Readonly<Record<string, number>>, sceneId: string): Record<string, number> =>
  Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith(`${sceneId}/`)).map(([key, mm]) => [key.slice(sceneId.length + 1), mm]));

/** The spacings with one surface's set (`null`: back to the toolbar's) */
export const withSurfaceGrid = (all: Readonly<Record<string, number>>, sceneId: string, surfaceId: string, mm: number | null): Record<string, number> => {
  const { [`${sceneId}/${surfaceId}`]: _old, ...rest } = all;
  return mm === null ? rest : { ...rest, [`${sceneId}/${surfaceId}`]: clampGrid(mm) };
};

/** The open book's surface grids: read once per book, written on a change, the open scene's handed to the stage */
class SurfaceGrids {
  bookId = $state<string | null>(null);
  sceneId = $state<string | null>(null);
  all = $state<Record<string, number>>({});

  /** The open book and scene: the stage gets that scene's spacings */
  enter(bookId: string, sceneId: string): void {
    if (this.bookId !== bookId) {
      this.bookId = bookId;
      this.all = readSurfaceGrids(bookId);
    }
    this.sceneId = sceneId;
    this.publish();
  }

  /** A surface's own spacing, null when it uses the toolbar's */
  of(sceneId: string, surfaceId: string): number | null {
    return this.all[`${sceneId}/${surfaceId}`] ?? null;
  }

  /** Set (or with `null` drop) a surface's own spacing */
  set(sceneId: string, surfaceId: string, mm: number | null): void {
    if (!this.bookId) return;
    this.all = withSurfaceGrid(this.all, sceneId, surfaceId, mm);
    writeStoredJson(keyOf(this.bookId), this.all);
    this.publish();
  }

  private publish(): void {
    updatePreview({ surfaceGrids: this.sceneId ? sceneSurfaceGrids(this.all, this.sceneId) : {} });
  }
}

export const surfaceGrids = new SurfaceGrids();
