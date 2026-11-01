import { samePath } from "./tree";
import { selectionLevel, type SelectionLevel, type SelectionState } from "./selection";

/**
 * The tree's rows as the selection and the keys see them (#163, #227): the **spread** (the top row), each **entry** in
 * page order, the entry's **target** (one with a printed image) while the entry is unfolded, and that target's visible
 * **nodes** (the root first). Every row is selectable: what a tap selects (`rowSelection`), whether a row is the
 * selected one (`isRowOn`), ↑ ↓ (`stepRow`) and ← to the row above in the hierarchy (`parentRow`). The tree panel
 * draws the rows; the rules are here.
 */

export type TreeRow =
  | { kind: "spread" }
  | { kind: "entry"; entryId: string; targetId: string | null }
  | { kind: "target"; targetId: string }
  | { kind: "node"; targetId: string; path: number[] };

/** What is selected, as the tree names it */
export type TreeItem = "spread" | "entry" | SelectionLevel;

/** The entries as the tree needs them: their ids and their targets (a target without a printed image has no row) */
export interface TreeEntry {
  id: string;
  target?: { id: string; imageSrc?: string } | null;
}

export interface TreeRowsOptions {
  /** The entry is unfolded: its target and nodes are rows */
  isOpen: (entryId: string) => boolean;
  /** The target's visible node paths, the root (`[]`) first; none for a target without AR content */
  nodes: (targetId: string) => number[][];
}

/** The rows in the order they are shown */
export const treeRows = (entries: readonly TreeEntry[], options: TreeRowsOptions): TreeRow[] => [
  { kind: "spread" },
  ...entries.flatMap((entry): TreeRow[] => {
    const target = entry.target;
    const row: TreeRow = { kind: "entry", entryId: entry.id, targetId: target?.id ?? null };
    if (!target?.imageSrc || !options.isOpen(entry.id)) return [row];
    return [row, { kind: "target", targetId: target.id }, ...options.nodes(target.id).map((path): TreeRow => ({ kind: "node", targetId: target.id, path }))];
  }),
];

/** The selection a tap on the row sets */
export const rowSelection = (row: TreeRow): SelectionState => {
  switch (row.kind) {
    case "spread": return { target: null, node: [], onTarget: true, spread: true };
    case "entry": return { target: row.targetId, node: [], onTarget: true, entry: row.entryId };
    case "target": return { target: row.targetId, node: [], onTarget: true };
    case "node": return { target: row.targetId, node: row.path, onTarget: false };
  }
};

/** The selected item: the spread, an entry, or the level of a target selection */
export const selectedItem = (selection: SelectionState, hasTree: boolean): TreeItem =>
  selection.spread ? "spread" : selection.entry ? "entry" : selectionLevel(selection, hasTree);

/**
 * The row is the selected one. `hasTree`: the target shows AR content – a target without is selected as the target,
 * whatever node the selection names.
 */
export const isRowOn = (row: TreeRow, selection: SelectionState, hasTree: (targetId: string) => boolean): boolean => {
  if (row.kind === "spread") return !!selection.spread;
  if (selection.spread) return false;
  if (row.kind === "entry") return selection.entry === row.entryId;
  if (selection.entry || selection.target !== row.targetId) return false;
  if (row.kind === "target") return selection.onTarget || !hasTree(row.targetId);
  return !selection.onTarget && samePath(selection.node, row.path);
};

/** ↑ ↓: the row before or after the selected one (the first row while none is selected); the ends stay */
export const stepRow = (rows: readonly TreeRow[], index: number, direction: -1 | 1): TreeRow | undefined =>
  rows[index < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, index + direction))];

/** ←: the row above in the hierarchy – a node's parent (the root's: its target), a target's entry, an entry's spread */
export const parentRow = (rows: readonly TreeRow[], index: number): TreeRow | undefined => {
  const row = rows[index];
  if (!row || row.kind === "spread") return undefined;
  if (row.kind === "entry") return rows.find(r => r.kind === "spread");
  if (row.kind === "target") return rows.find(r => r.kind === "entry" && r.targetId === row.targetId);
  const parent = row.path.slice(0, -1);
  return row.path.length
    ? rows.find(r => r.kind === "node" && r.targetId === row.targetId && samePath(r.path, parent))
    : rows.find(r => r.kind === "target" && r.targetId === row.targetId);
};
