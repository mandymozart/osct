/**
 * The Scenes panel's model (#307 phase 3a, `agents/SCENES.md`): the experience as an ordered list of scenes, the groups as
 * bands over runs of their scenes, the counts against a group's loading window, picking scenes (a click, Shift for a
 * range, Ctrl for one more), the arrow keys, and where a dragged scene or band lands – the request for
 * `POST …/scenes/move` and the order it makes. Pure: the strip under the stage (`ScenesPanel.svelte`) and the book page's
 * scene cards (`SceneCards.svelte`) use it alike, `lib/__tests__/scene-strip.test.ts` tests it.
 */
import { GROUP_WINDOW_TARGETS } from "@shared/api/editor";
import { hasOwnSpreadTitle } from "@shared/api/spread-titles";
import type { GroupData, SurfaceData } from "@shared/types/game-config";
import { pagesOf } from "./spread-grid";

/** A scene as the strip needs it – the book tree's spread (`TreeSpread`) is one */
export interface StripScene {
  id: string;
  title: string;
  firstPage: number;
  lastPage: number;
  format?: string;
  matter?: string;
  label?: string;
  group?: string;
  surfaces?: readonly SurfaceData[];
  entries: readonly { target?: unknown }[];
}

/** How many targets lie on a scene */
export const targetsOf = (scene: Pick<StripScene, "entries">): number => scene.entries.filter(entry => !!entry.target).length;

/** The card's name: the scene's label, else its own title (a matter scene's numbered one too), else its pages (`40–41`, `cover`) */
export const sceneName = (scene: StripScene): string => {
  if (scene.label?.trim()) return scene.label.trim();
  const title = scene.title.trim();
  return title && (hasOwnSpreadTitle(title) || scene.matter) ? title : pagesOf(scene);
};

/** A run of scenes next to each other: a group's band (`group`) or scenes of no group (`group` null) */
export interface StripRun<T extends StripScene> {
  group: GroupData | null;
  scenes: T[];
  /** The index of its first scene in the whole order */
  start: number;
}

/**
 * The strip's runs in order: the scenes of one group next to each other are one band. A group's scenes apart from each
 * other (content made elsewhere) are two bands of the same group; a group id the book does not list shows by its id.
 */
export const stripRuns = <T extends StripScene>(scenes: readonly T[], groups: readonly GroupData[] = []): StripRun<T>[] => {
  const runs: StripRun<T>[] = [];
  scenes.forEach((scene, index) => {
    const id = scene.group ?? null;
    const last = runs.at(-1);
    if (last && (last.group?.id ?? null) === id) last.scenes.push(scene);
    else runs.push({ group: id === null ? null : (groups.find(g => g.id === id) ?? { id, label: id }), scenes: [scene], start: index });
  });
  return runs;
};

/** A band's counts: its scenes, their targets, and whether that is more than the loading window holds at once */
export interface RunCounts {
  scenes: number;
  targets: number;
  over: boolean;
}

export const runCounts = (scenes: readonly Pick<StripScene, "entries">[], window: number = GROUP_WINDOW_TARGETS): RunCounts => {
  const targets = scenes.reduce((sum, scene) => sum + targetsOf(scene), 0);
  return { scenes: scenes.length, targets, over: targets > window };
};

/** All scenes of a group (wherever they lie) in order */
export const groupScenes = <T extends StripScene>(scenes: readonly T[], groupId: string): T[] => scenes.filter(scene => scene.group === groupId);

// ── picking ──────────────────────────────────────────────────────────────────────────────────────────

/** The picked scenes (in order) and the anchor a Shift range starts from */
export interface Picks {
  picked: string[];
  anchor: string | null;
}

/** A click picks the scene alone, Ctrl adds or removes it, Shift picks the range from the anchor */
export type PickMode = "only" | "toggle" | "range";

export const pickModeOf = (event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): PickMode =>
  event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "only";

/** The picks after picking `id` – always in the strip's order; ids no longer in `order` are dropped */
export const pickScenes = (order: readonly string[], picks: Picks, id: string, mode: PickMode): Picks => {
  const inOrder = (ids: Set<string>) => order.filter(x => ids.has(x));
  if (mode === "toggle") {
    const next = new Set(picks.picked.filter(x => order.includes(x)));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { picked: inOrder(next), anchor: id };
  }
  if (mode === "range" && picks.anchor && order.includes(picks.anchor)) {
    const [a, b] = [order.indexOf(picks.anchor), order.indexOf(id)].sort((x, y) => x - y);
    return { picked: order.slice(a, b + 1), anchor: picks.anchor };
  }
  return { picked: order.includes(id) ? [id] : [], anchor: id };
};

/** The scene `delta` steps from `current` (the first or last at the ends; the first when none is current) */
export const stepScene = (order: readonly string[], current: string | null, delta: number): string | null => {
  if (!order.length) return null;
  const index = current ? order.indexOf(current) : -1;
  if (index < 0) return order[delta < 0 ? order.length - 1 : 0];
  return order[Math.max(0, Math.min(order.length - 1, index + delta))];
};

/** What a key does in the strip: ← → move, Shift+← → pick on, Enter opens, Ctrl+G groups, Ctrl+Shift+G ungroups */
export type StripKey = { move: -1 | 1; extend: boolean } | "open" | "group" | "ungroup" | null;

export const stripKey = (event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey?: boolean }): StripKey => {
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && event.key.toLowerCase() === "g") return event.shiftKey ? "ungroup" : "group";
  if (ctrl || event.altKey) return null;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") return { move: -1, extend: event.shiftKey };
  if (event.key === "ArrowRight" || event.key === "ArrowDown") return { move: 1, extend: event.shiftKey };
  if (event.key === "Enter") return "open";
  return null;
};

// ── dropping ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Where a drag lands: the gap before the scene at `gap` in the whole order (`scenes.length` = after the last) and the
 * group it joins there (null: none). The scene under the pointer decides both – its left half the gap before it, its
 * right half the one after it, and its group: the gap between a band's last scene and a scene of no group is inside the
 * band over the band's scene and outside over the other.
 */
export interface Drop {
  gap: number;
  group: string | null;
}

export const dropOver = (scenes: readonly Pick<StripScene, "group">[], index: number, after: boolean): Drop => ({
  gap: Math.max(0, Math.min(scenes.length, index + (after ? 1 : 0))),
  group: scenes[index]?.group ?? null,
});

/** The drop after every scene, in no group (the add tile, the strip's empty end) */
export const dropAtEnd = (scenes: readonly unknown[]): Drop => ({ gap: scenes.length, group: null });

/**
 * A whole band dragged keeps its group and lands between runs only: a gap inside another group's band moves to that band's
 * end (or its start, when the gap is its first)
 */
export const bandDrop = (scenes: readonly Pick<StripScene, "group">[], drop: Drop, own: string): Drop => {
  const groupAt = (i: number) => scenes[i]?.group ?? null;
  const before = groupAt(drop.gap - 1);
  if (drop.gap <= 0 || drop.gap >= scenes.length || before === null || before === own || before !== groupAt(drop.gap)) return drop;
  let end = drop.gap;
  while (end < scenes.length && groupAt(end) === before) end += 1;
  return { gap: end, group: null };
};

/**
 * Where the gold line of a drop is drawn: before the scene at the gap – or after the scene before it, when the drop joins
 * that scene's band and not the next one's (the end of a band, the end of the strip)
 */
export const dropMark = (scenes: readonly Pick<StripScene, "group">[], drop: Drop): { index: number; side: "before" | "after" } | null => {
  if (!scenes.length) return null;
  const { gap } = drop;
  const groupAt = (i: number) => scenes[i]?.group ?? null;
  if (gap >= scenes.length) return { index: scenes.length - 1, side: "after" };
  if (gap > 0 && groupAt(gap) !== drop.group && groupAt(gap - 1) === drop.group) return { index: gap - 1, side: "after" };
  return { index: gap, side: "before" };
};

/** The body of `POST …/scenes/move` for a drop */
export type MoveRequest = { scenes: string[]; group?: string | null } & ({ after: string } | { before: string } | { position: number });

export interface DropPlan {
  /** Every scene id in the order the drop makes */
  order: string[];
  request: MoveRequest;
  /** Whether the drop changes anything (the order or a picked scene's group) – else nothing is sent */
  changed: boolean;
}

/**
 * What a drop of the picked scenes (moved as a block, in their order) at `drop` does – the order as the server makes it
 * (`Scenes::orderAfterMove`: placed after the nearest scene before the gap that stays, else before the first) and the
 * request. `keepGroup` (a whole band dragged): the scenes keep their group, no `group` is sent.
 */
export const planDrop = (scenes: readonly Pick<StripScene, "id" | "group">[], picked: readonly string[], drop: Drop, keepGroup = false): DropPlan => {
  const ids = scenes.map(scene => scene.id);
  const moving = ids.filter(id => picked.includes(id));
  const rest = ids.filter(id => !picked.includes(id));
  const at = ids.slice(0, drop.gap).filter(id => !picked.includes(id)).length;
  const order = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  const place = at > 0 ? { after: rest[at - 1] } : rest.length ? { before: rest[0] } : { position: 0 };
  const groupOf = (id: string) => scenes.find(scene => scene.id === id)?.group ?? null;
  const regrouped = !keepGroup && moving.some(id => groupOf(id) !== drop.group);
  const request: MoveRequest = { scenes: moving, ...place, ...(keepGroup ? {} : { group: drop.group }) };
  return { order, request, changed: moving.length > 0 && (regrouped || order.some((id, i) => id !== ids[i])) };
};

// ── groups ───────────────────────────────────────────────────────────────────────────────────────────

/** A new group's label: `Group n`, the first one the book does not have */
export const newGroupLabel = (groups: readonly Pick<GroupData, "label">[]): string => {
  const taken = new Set(groups.map(g => g.label.trim().toLowerCase()));
  let n = groups.length + 1;
  while (taken.has(`group ${n}`)) n += 1;
  return `Group ${n}`;
};

/** The picked scenes that lie in a group – what Ungroup takes out */
export const groupedOf = (scenes: readonly Pick<StripScene, "id" | "group">[], picked: readonly string[]): string[] =>
  scenes.filter(scene => picked.includes(scene.id) && scene.group).map(scene => scene.id);

/**
 * What Ungroup does with picked scenes (`groupedOf`): the groups all of whose scenes are picked go as a whole (`whole`),
 * the picked scenes of the other groups leave theirs (`leaving`)
 */
export const ungroupPlan = (scenes: readonly Pick<StripScene, "id" | "group">[], picked: readonly string[]): { whole: string[]; leaving: string[] } => {
  const groups = [...new Set(scenes.filter(s => picked.includes(s.id) && s.group).map(s => s.group!))];
  const whole = groups.filter(g => scenes.every(s => s.group !== g || picked.includes(s.id)));
  const leaving = scenes.filter(s => picked.includes(s.id) && s.group && !whole.includes(s.group)).map(s => s.id);
  return { whole, leaving };
};

/** The scenes a group's Inspector names: `22–23 … 30–31` (the first and the last) */
export const sceneSpan = (names: readonly string[]): string =>
  names.length === 0 ? "none" : names.length === 1 ? names[0] : names.length === 2 ? `${names[0]}, ${names[1]}` : `${names[0]} … ${names.at(-1)}`;

// ── the card ─────────────────────────────────────────────────────────────────────────────────────────

/** A surface's size in words: `230 × 320 mm` */
export const surfaceSize = (surface: Pick<SurfaceData, "widthMm" | "heightMm">): string => `${Math.round(surface.widthMm)} × ${Math.round(surface.heightMm)} mm`;

/**
 * The parts of a card's thumbnail for a scene drawn from its surfaces (no sheet, no page image): each surface's share of
 * the width, and the whole's width : height. None for a scene without surfaces.
 */
export const surfaceParts = (surfaces: readonly Pick<SurfaceData, "id" | "widthMm" | "heightMm" | "label">[] | undefined): { parts: { id: string; share: number; label: string }[]; ratio: number } | null => {
  if (!surfaces?.length) return null;
  const width = surfaces.reduce((sum, s) => sum + Math.max(1, s.widthMm), 0);
  const height = Math.max(...surfaces.map(s => Math.max(1, s.heightMm)));
  return { parts: surfaces.map(s => ({ id: s.id, share: Math.max(1, s.widthMm) / width, label: s.label ?? "" })), ratio: width / height };
};

/** The grid's column: never narrower than this (px) – a card stays readable – and, while there is room for more, never wider */
export const GRID_COLUMN_MIN = 88;
export const GRID_COLUMN_MAX = 168;

/**
 * The Scenes panel as a **grid** (#315): page-wide columns that wrap, as many as the panel's width holds – the fewest
 * that keep a column at most `GRID_COLUMN_MAX`, but never so many that one is narrower than `GRID_COLUMN_MIN`, and at
 * least one (a narrow panel is one column). A card spans as many columns as it has pages (a double page two, a fold-out
 * three); its height follows the column's width and the page's ratio, so the cards scale with the panel by themselves.
 * A short panel (`maxCardHeight`) narrows the columns – down to `GRID_COLUMN_FLOOR` – so a whole row still shows.
 */
export const GRID_COLUMN_FLOOR = 48;
export const gridColumns = (width: number, pageRatio: number, gap: number, maxCardHeight = Infinity): { columns: number; column: number; cardHeight: number } => {
  const room = Math.max(0, width);
  const ratio = pageRatio > 0 ? pageRatio : 1;
  const widest = Math.max(GRID_COLUMN_FLOOR, Math.min(GRID_COLUMN_MAX, maxCardHeight * ratio));
  // Held down by the height, the columns may go as narrow as the floor: the fewest that keep the cards short enough
  const narrowest = widest < GRID_COLUMN_MIN ? GRID_COLUMN_FLOOR : GRID_COLUMN_MIN;
  const fewest = Math.ceil((room + gap) / (widest + gap));
  const most = Math.floor((room + gap) / (narrowest + gap));
  const columns = Math.max(1, Math.min(fewest, most));
  const column = Math.max(1, (room - (columns - 1) * gap) / columns);
  return { columns, column, cardHeight: column / ratio };
};

/** How many grid columns a card of `ratio` spans: its pages, at least one, at most the columns there are */
export const gridSpan = (ratio: number, pageRatio: number, columns: number): number =>
  Math.max(1, Math.min(columns, Math.round(ratio / (pageRatio > 0 ? pageRatio : 1))));
