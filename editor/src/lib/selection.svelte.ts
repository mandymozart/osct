import { parentSelection, selectionLevel, type SelectionLevel, type SelectionState } from "./selection";

/**
 * The workspace's one selection (#162): a target, its entity or a node – or the spread or an entry from the tree's
 * top rows (#227) – read and written by the tree, the stage (picking, the gizmo, the outline) and the Entity panel:
 * selecting in one selects in the others. The rules are `selection.ts`; the workspace page resets it when it opens.
 */
class Selection implements SelectionState {
  target = $state<string | null>(null);
  node = $state<number[]>([]);
  onTarget = $state(true);
  /** The spread is selected (the tree's top row): the Stage panel's spread section shows it */
  spread = $state(false);
  /** The selected entry's id: the Entity panel shows the entry; `target` is its target (or null) */
  entry = $state<string | null>(null);
  /**
   * The author cleared the selection (a click on the stage that picks nothing): the Entity panel then shows none
   * instead of falling back to a target, until the next selection. A fresh workspace (`reset`) may fall back.
   */
  cleared = $state(false);

  /** The target itself (its target fields, the print outlined on the stage) */
  selectTarget(target: string | null): void {
    this.set({ target, node: [], onTarget: true });
  }

  /** A node of the target's entity (`[]` = the root, the entity) */
  selectNode(target: string, path: number[]): void {
    this.set({ target, node: path, onTarget: false });
  }

  /** The spread itself: no target and no node selected on the stage */
  selectSpread(): void {
    this.set({ target: null, node: [], onTarget: true, spread: true });
  }

  /** An entry; with a target the stage outlines its print, as for a selected target */
  selectEntry(entry: string, target: string | null): void {
    this.set({ target, node: [], onTarget: true, entry });
  }

  set(next: SelectionState): void {
    this.target = next.target;
    this.node = next.node;
    this.onTarget = next.onTarget;
    this.spread = next.spread ?? false;
    this.entry = next.entry ?? null;
    this.cleared = false;
  }

  /** Nothing selected, on purpose: the tree, the stage and the Entity panel all show none */
  clear(): void {
    this.set({ target: null, node: [], onTarget: true });
    this.cleared = true;
  }

  /** One level up (the breadcrumb, ← in the tree) */
  up(): void {
    // The fields one by one: a class's state fields are accessors, a spread of `this` would not copy them
    this.set(parentSelection(this.snapshot()));
  }

  /** The selection as a plain value */
  snapshot(): SelectionState {
    return { target: this.target, node: this.node, onTarget: this.onTarget, spread: this.spread, entry: this.entry };
  }

  level(hasTree: boolean): SelectionLevel {
    return selectionLevel(this, hasTree);
  }

  reset(): void {
    this.set({ target: null, node: [], onTarget: true });
  }
}

export const selection = new Selection();
