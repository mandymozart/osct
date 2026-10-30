/**
 * The widths of the workspace's columns (#144): the **tree** at the left, the **panel** at the right and the panel
 * while it shows the **code** (which opens wider). Their edges are dragged; a width is clamped to its column's limits
 * against the window (and the other column, so the stage keeps room) and stored per browser
 * (`osct-editor-widths`, one JSON object of pixels). A column nobody has dragged yet, or one reset by a double-click
 * on its edge, takes its default.
 *
 * On a phone the panel is a sheet at the bottom whose **height** is dragged instead (#155): stored next to the widths
 * as `sheet`, a share of the screen's height, clamped to at most `SHEET_MAX` and snapped to `SHEET_SNAPS` when a
 * drag ends (0 = closed, the tab row only).
 */

export type Column = "tree" | "panel" | "code";

const KEY = "osct-editor-widths";
const REM = 16;
/** The stage keeps at least this much (px) between the columns (a 768 px tablet in portrait still shows a stage) */
export const STAGE_MIN = 16 * REM;

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
  /* 25rem: the tab row (× ‹ › and the five words) fits on one line (#170) */
  panel: { initial: 25 * REM, min: 16 * REM, maxShare: 0.7 },
  code: { initial: 36 * REM, min: 16 * REM, maxShare: 0.7 },
};

/**
 * Below this window width the tree starts collapsed to its bar (#172): a tablet in portrait (768 px) then gives the
 * panel its default 25rem – the tab row on one line, three digits in the axis fields – and the stage the rest
 */
export const TREE_OPEN_MIN = 64 * REM;

/** Whether the tree column starts open: as it was left on this device (`stored`), else in a window of TREE_OPEN_MIN or more */
export const treeStartsOpen = (viewport: number, stored: string | null): boolean =>
  stored === "open" || (stored !== "closed" && viewport >= TREE_OPEN_MIN);

/**
 * The panel's tabs show as words in a panel at least this wide (px), × ‹ › included; narrower, they are icons as on the
 * phone, so the head stays one line (#172, RULES #32). With a finger every button is the touch height, wider too.
 */
export const WORD_TABS_MIN = { fine: 24 * REM, coarse: 28 * REM } as const;

export const wordTabs = (panelWidth: number, coarse: boolean): boolean => panelWidth >= WORD_TABS_MIN[coarse ? "coarse" : "fine"];

/** The highest the phone's sheet may be, as a share of the screen */
export const SHEET_MAX = 0.85;
/** The sheet's height until it is dragged (or after a double tap on its grip) */
export const SHEET_INITIAL = 0.5;
/** Where a drag of the sheet lands: closed, a third, half, almost full */
export const SHEET_SNAPS: readonly number[] = [0, 1 / 3, 1 / 2, SHEET_MAX];
/** How far (s) a flick carries the sheet on when it is let go */
const FLICK_SECONDS = 0.2;

/** The sheet's height (share of the screen) within its limits: at least `min` (the tab row), at most `SHEET_MAX` */
export const clampSheet = (share: number, min = 0): number =>
  Math.max(Math.min(min, SHEET_MAX), Math.min(share, SHEET_MAX));

/**
 * The snap point a drag ends on: the one nearest to where the sheet would come to rest, carried on by the flick's
 * `velocity` (shares of the screen per second, upward positive). 0 means the sheet closes.
 */
export const snapSheet = (share: number, velocity = 0): number => {
  const aim = share + velocity * FLICK_SECONDS;
  return SHEET_SNAPS.reduce((best, snap) => (Math.abs(snap - aim) < Math.abs(best - aim) ? snap : best));
};

/**
 * Whether the phone's ‹ › leave the stage's lower corners for its top row, next to the toolbar (#177): at the lower
 * corners they need the toolbar's height (`toolbar`, px – one row since its groups collapse, #180) above them, their
 * own row (`step`) and a `margin` above, between and below; a shorter stage – the sheet almost full – would put them
 * over the toolbar's tools. The toolbar always leaves them that room on its row, so it never scrolls.
 */
export const stepsOnTop = (stage: number, toolbar: number, step: number, margin: number): boolean =>
  stage < toolbar + step + 3 * margin;

interface Stored extends Partial<Record<Column, number>> {
  /** The sheet's height, a share of the screen */
  sheet?: number;
}

/**
 * A column's width within its limits: at least its minimum, at most its share of the window and what leaves the
 * stage its room next to the other column (`other` px). The minimum wins over a window too small for both.
 */
export const clampWidth = (column: Column, width: number, viewport: number, other = 0): number =>
  Math.round(Math.max(LIMITS[column].min, Math.min(width, maxWidth(column, viewport, other))));

/** The widest a column may be in a window `viewport` px wide next to the other column's `other` px */
export const maxWidth = (column: Column, viewport: number, other = 0): number =>
  Math.round(Math.min(viewport * LIMITS[column].maxShare, viewport - other - STAGE_MIN));

const read = (): Stored => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [Column | "sheet", number] =>
      typeof e[1] === "number" && Number.isFinite(e[1]) && e[1] > 0 && (e[0] in LIMITS || (e[0] === "sheet" && e[1] <= 1))));
  } catch {
    return {};
  }
};

class Widths {
  #stored = $state<Stored>(read());

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

  /** The sheet's height (share of the screen), at least `min` (the tab row and a little of the panel) */
  sheet(min = 0): number {
    return clampSheet(this.#stored.sheet ?? SHEET_INITIAL, min);
  }

  /** Set the sheet's height while it is dragged (stored by `save`) */
  setSheet(share: number) {
    this.#stored = { ...this.#stored, sheet: Math.round(clampSheet(share) * 10000) / 10000 };
  }

  /** Back to the sheet's default height (a double tap on its grip) */
  resetSheet() {
    const { sheet: _, ...rest } = this.#stored;
    this.#stored = rest;
    this.save();
  }

  /** Read the stored widths again (tests; another tab's changes) */
  reload() {
    this.#stored = read();
  }
}

export const widths = new Widths();
