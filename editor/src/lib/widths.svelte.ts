/**
 * The widths of the workspace's columns (#144): the **tree** at the left, the **panel** at the right and the panel
 * while it shows the **code** (which opens wider). Their edges are dragged; a width is clamped to its column's limits
 * against the window (and the other column, so the stage keeps room) and stored per browser
 * (`osct-editor-widths`, one JSON object of pixels). A column nobody has dragged yet, or one reset by a double-click
 * on its edge, takes its default.
 */

export type Column = "tree" | "panel" | "code";

const KEY = "osct-editor-widths";
const REM = 16;
/** The stage keeps at least this much (px) between the columns */
export const STAGE_MIN = 12 * REM;

interface Limits {
  /** The default width (px) */
  initial: number;
  /** The narrowest (px) */
  min: number;
  /** The widest, as a share of the window */
  maxShare: number;
}

export const LIMITS: Record<Column, Limits> = {
  tree: { initial: 15 * REM, min: 10 * REM, maxShare: 0.4 },
  panel: { initial: 22 * REM, min: 18 * REM, maxShare: 0.7 },
  code: { initial: 36 * REM, min: 18 * REM, maxShare: 0.7 },
};

/**
 * A column's width within its limits: at least its minimum, at most its share of the window and what leaves the
 * stage its room next to the other column (`other` px). The minimum wins over a window too small for both.
 */
export const clampWidth = (column: Column, width: number, viewport: number, other = 0): number =>
  Math.round(Math.max(LIMITS[column].min, Math.min(width, maxWidth(column, viewport, other))));

/** The widest a column may be in a window `viewport` px wide next to the other column's `other` px */
export const maxWidth = (column: Column, viewport: number, other = 0): number =>
  Math.round(Math.min(viewport * LIMITS[column].maxShare, viewport - other - STAGE_MIN));

const read = (): Partial<Record<Column, number>> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [Column, number] =>
      e[0] in LIMITS && typeof e[1] === "number" && Number.isFinite(e[1]) && e[1] > 0));
  } catch {
    return {};
  }
};

class Widths {
  #stored = $state<Partial<Record<Column, number>>>(read());

  /** The column's width (px) in a window `viewport` px wide, next to the other column's `other` px */
  width(column: Column, viewport: number, other = 0): number {
    return clampWidth(column, this.#stored[column] ?? LIMITS[column].initial, viewport, other);
  }

  /** Set a width while its edge is dragged (stored by `save`) */
  set(column: Column, width: number) {
    this.#stored = { ...this.#stored, [column]: Math.round(width) };
  }

  /** Store the widths (the end of a drag) */
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.#stored)); } catch { /* storage blocked */ }
  }

  /** Back to the column's default (a double-click on its edge) */
  reset(column: Column) {
    const { [column]: _, ...rest } = this.#stored;
    this.#stored = rest;
    this.save();
  }

  /** Read the stored widths again (tests; another tab's changes) */
  reload() {
    this.#stored = read();
  }
}

export const widths = new Widths();
