import type { EntityData } from "@engine/types";
import { nodeAt } from "./values";
import { nodeLabel } from "./tree";

/**
 * The editor's one selection (#162), shared by the tree, the stage and the Inspector: a **target** (its printed
 * image – the Inspector shows its target fields, the stage outlines the print), its **entity** (the root node) or
 * a **node** below it (the Inspector at that node, the gizmo on it). A target without AR content can only be
 * selected as the target. The tree's top rows select too (#227): the **scene** (the Inspector shows it, no target
 * or node on the stage) and an **entry** (the Inspector shows the entry; with a target, `target` is it, so the stage
 * outlines its print as for a selected target). The top bar's ⚙ after the experience's crumb selects the **experience** (#237: the Inspector shows
 * its texts and settings, nothing on the stage). Nothing selected is the scene (#229, `settledSelection`). The pure
 * rules – the level, one level up, the breadcrumb – live here, the tree's rows in `tree-rows.ts`; the shared state is
 * `selection.svelte.ts`.
 */

export type SelectionLevel = "none" | "target" | "entity" | "node";

export interface SelectionState {
  target: string | null;
  /** The node's path in the target's entity (`[]` = the root); not used while the target itself is selected */
  node: number[];
  /** The target itself is selected, not a node of its entity */
  onTarget: boolean;
  /** The scene itself is selected (the tree's top row, #227; nothing else selected, #229): no target, no node */
  scene?: boolean;
  /** An entry is selected (its id, #227); `target` is its target or null for an entry without one */
  entry?: string | null;
  /** The experience is selected (the top bar's ⚙, #237): no scene, target, node or entry */
  experience?: boolean;
  /** A group is selected (its id – a band of the Scenes panel, #307): the Inspector shows the group, nothing on the stage */
  group?: string | null;
  /**
   * A surface of a scene is selected (#314, the Surface mode, the Tree's Surfaces level): the Inspector shows it, the stage
   * highlights it – no target, node or entry
   */
  surface?: SurfaceRef | null;
}

/** A surface of a scene by ids (#314) */
export interface SurfaceRef {
  scene: string;
  id: string;
}

/**
 * A selection as the workspace keeps it (#229): the scene when nothing else is selected – no target, no entry – so the
 * tree highlights its row and the Inspector shows it; the scene selected names no target, node or entry
 */
export const settledSelection = (selection: SelectionState): SelectionState => {
  if (selection.experience) return { target: null, node: [], onTarget: true, scene: false, entry: null, experience: true };
  if (selection.group) return { target: null, node: [], onTarget: true, scene: false, entry: null, group: selection.group };
  if (selection.surface) return { target: null, node: [], onTarget: true, scene: false, entry: null, surface: { scene: selection.surface.scene, id: selection.surface.id } };
  if (selection.scene || (!selection.target && !selection.entry)) return { target: null, node: [], onTarget: true, scene: true, entry: null };
  return { ...selection, scene: false, entry: selection.entry ?? null };
};

/** The level of a selection: a target without a tree is always selected as the target */
export const selectionLevel = (selection: SelectionState, hasTree: boolean): SelectionLevel => {
  if (!selection.target) return "none";
  if (selection.onTarget || !hasTree) return "target";
  return selection.node.length ? "node" : "entity";
};

/** One level up: a node → its parent, the entity → its target, a surface → the scene; the target (an entry, the scene) stays */
export const parentSelection = (selection: SelectionState): SelectionState => {
  if (selection.surface) return { target: null, node: [], onTarget: true, scene: true };
  if (selection.experience || selection.group || selection.scene || selection.entry || !selection.target || selection.onTarget) return { ...selection, node: [] };
  if (!selection.node.length) return { target: selection.target, node: [], onTarget: true };
  return { target: selection.target, node: selection.node.slice(0, -1), onTarget: false };
};

export interface Crumb {
  label: string;
  level: Exclude<SelectionLevel, "none">;
  /** What a click on the crumb selects */
  selection: SelectionState;
  /** The selected level (the last crumb) */
  current: boolean;
}

/** The breadcrumb of a selection: target › entity › group › node, each a level to step up to */
export const breadcrumb = (selection: SelectionState, tree: EntityData | undefined): Crumb[] => {
  const target = selection.target;
  if (!target) return [];
  const level = selectionLevel(selection, !!tree);
  const crumbs: Crumb[] = [{ label: target, level: "target", selection: { target, node: [], onTarget: true }, current: level === "target" }];
  if (level === "target" || !tree) return crumbs;
  const path = nodeAt(tree, selection.node) ? selection.node : [];
  for (let depth = 0; depth <= path.length; depth++) {
    const at = path.slice(0, depth);
    const node = nodeAt(tree, at)!;
    crumbs.push({ label: nodeLabel(node), level: depth ? "node" : "entity", selection: { target, node: at, onTarget: false }, current: depth === path.length });
  }
  return crumbs;
};

// ── Multi-select (#369), Blender's: several things selected, the last click the active one ──

/**
 * One thing of a multi-selection: a surface, an entry (its target's print outlined), a target's print or a node of its
 * entity. The scene, a group and the experience are selected alone.
 */
export type SelectionItem =
  | { kind: "surface"; scene: string; id: string }
  | { kind: "entry"; entry: string; target: string | null }
  | { kind: "target"; target: string }
  | { kind: "node"; target: string; path: number[] };

/** A multi-selection: the active one (what the Inspector shows, the gizmo holds – the last click) and the rest */
export interface MultiSelection {
  active: SelectionItem | null;
  others: SelectionItem[];
}

/** An item's identity, for comparing and as a key */
export const itemKey = (item: SelectionItem): string => {
  switch (item.kind) {
    case "surface": return `surface:${item.scene}:${item.id}`;
    case "entry": return `entry:${item.entry}`;
    case "target": return `target:${item.target}`;
    case "node": return `node:${item.target}:${item.path.join(".")}`;
  }
};

/** The item a selection stands for; null for the scene, a group and the experience (they are selected alone) */
export const itemOf = (selection: SelectionState): SelectionItem | null => {
  const settled = settledSelection(selection);
  if (settled.experience || settled.group || settled.scene) return null;
  if (settled.surface) return { kind: "surface", scene: settled.surface.scene, id: settled.surface.id };
  if (settled.entry) return { kind: "entry", entry: settled.entry, target: settled.target };
  if (!settled.target) return null;
  return settled.onTarget ? { kind: "target", target: settled.target } : { kind: "node", target: settled.target, path: [...settled.node] };
};

/** The selection one item stands for */
export const itemSelection = (item: SelectionItem): SelectionState => {
  switch (item.kind) {
    case "surface": return { target: null, node: [], onTarget: true, surface: { scene: item.scene, id: item.id } };
    case "entry": return { target: item.target, node: [], onTarget: true, entry: item.entry };
    case "target": return { target: item.target, node: [], onTarget: true };
    case "node": return { target: item.target, node: [...item.path], onTarget: false };
  }
};

const has = (items: readonly SelectionItem[], item: SelectionItem) => items.some(other => itemKey(other) === itemKey(item));
const without = (items: readonly SelectionItem[], item: SelectionItem) => items.filter(other => itemKey(other) !== itemKey(item));
/** The active one joins the rest (when there is one) */
const withActive = (multi: MultiSelection): SelectionItem[] => (multi.active && !has(multi.others, multi.active) ? [...multi.others, multi.active] : [...multi.others]);

/** Every selected item, the active one first */
export const allItems = (multi: MultiSelection): SelectionItem[] => (multi.active ? [multi.active, ...without(multi.others, multi.active)] : [...multi.others]);

/**
 * Shift + click on the stage (Blender's viewport): a thing not selected is added and becomes the active one; a selected
 * one that is not active becomes the active one; the active one is deselected – the last of the rest takes its place
 */
export const extended = (multi: MultiSelection, item: SelectionItem): MultiSelection => {
  if (multi.active && itemKey(multi.active) === itemKey(item)) {
    const others = without(multi.others, item);
    return { active: others.at(-1) ?? null, others: others.slice(0, -1) };
  }
  return { active: item, others: without(withActive(multi), item) };
};

/**
 * Ctrl + click in the tree (Blender's outliner): a row not selected is added and becomes the active one; a selected
 * one is deselected (the active one: the last of the rest takes its place)
 */
export const toggled = (multi: MultiSelection, item: SelectionItem): MultiSelection => {
  if (multi.active && itemKey(multi.active) === itemKey(item)) return extended(multi, item);
  if (has(multi.others, item)) return { active: multi.active, others: without(multi.others, item) };
  return { active: item, others: withActive(multi) };
};

/**
 * Shift + click in the tree (Blender's outliner): the rows from the active one to the clicked one (in the tree's
 * order, `rows`) are the selection, the clicked one active. Without an active one in the rows: the clicked one alone.
 */
export const ranged = (multi: MultiSelection, item: SelectionItem, rows: readonly SelectionItem[]): MultiSelection => {
  const from = multi.active ? rows.findIndex(row => itemKey(row) === itemKey(multi.active!)) : -1;
  const to = rows.findIndex(row => itemKey(row) === itemKey(item));
  if (from < 0 || to < 0) return { active: item, others: [] };
  const span = rows.slice(Math.min(from, to), Math.max(from, to) + 1);
  return { active: item, others: without(span, item) };
};

/** Several added at once (a box, B + drag): the active one stays; none before = the last added becomes it */
export const added = (multi: MultiSelection, items: readonly SelectionItem[]): MultiSelection => {
  const all = [...withActive(multi)];
  for (const item of items) if (!has(all, item)) all.push(item);
  const active = multi.active ?? all.at(-1) ?? null;
  return { active, others: active ? without(all, active) : all };
};

/** Several removed at once (a box with Shift): the active one among them goes too – the last of the rest takes its place */
export const removed = (multi: MultiSelection, items: readonly SelectionItem[]): MultiSelection => {
  const all = withActive(multi).filter(item => !has(items, item));
  const active = multi.active && has(all, multi.active) ? multi.active : (all.at(-1) ?? null);
  return { active, others: active ? without(all, active) : all };
};

/** Ctrl + I (Blender's): what was selected is not, what was not is – of `all` (the open scene's things); the active one goes */
export const inverted = (multi: MultiSelection, all: readonly SelectionItem[]): MultiSelection => {
  const selected = withActive(multi);
  const rest = all.filter(item => !has(selected, item));
  return { active: rest.at(-1) ?? null, others: rest.slice(0, -1) };
};
