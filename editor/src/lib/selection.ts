import type { EntityData } from "@engine/types";
import { nodeAt } from "./values";
import { nodeLabel } from "./tree";

/**
 * The editor's one selection (#162), shared by the tree, the stage and the inspector: a **target** (its printed
 * image – the Entity panel shows its target fields, the stage outlines the print), its **entity** (the root node) or
 * a **node** below it (the Entity panel at that node, the gizmo on it). A target without AR content can only be
 * selected as the target. The tree's top rows select too (#227): the **spread** (the Stage panel's spread section,
 * no target or node on the stage) and an **entry** (the Entity panel shows the entry; with a target, `target` is it,
 * so the stage outlines its print as for a selected target). The pure rules – the level, one level up, the
 * breadcrumb – live here, the tree's rows in `tree-rows.ts`; the shared state is `selection.svelte.ts`.
 */

export type SelectionLevel = "none" | "target" | "entity" | "node";

export interface SelectionState {
  target: string | null;
  /** The node's path in the target's entity (`[]` = the root); not used while the target itself is selected */
  node: number[];
  /** The target itself is selected, not a node of its entity */
  onTarget: boolean;
  /** The spread itself is selected (the tree's top row, #227): no target, no node */
  spread?: boolean;
  /** An entry is selected (its id, #227); `target` is its target or null for an entry without one */
  entry?: string | null;
}

/** The level of a selection: a target without a tree is always selected as the target */
export const selectionLevel = (selection: SelectionState, hasTree: boolean): SelectionLevel => {
  if (!selection.target) return "none";
  if (selection.onTarget || !hasTree) return "target";
  return selection.node.length ? "node" : "entity";
};

/** One level up: a node → its parent, the entity → its target; the target (an entry, the spread) stays */
export const parentSelection = (selection: SelectionState): SelectionState => {
  if (selection.spread || selection.entry || !selection.target || selection.onTarget) return { ...selection, node: [] };
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
