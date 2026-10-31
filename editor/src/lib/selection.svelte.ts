import { parentSelection, selectionLevel, settledSelection, type SelectionLevel, type SelectionState } from "./selection";

/**
 * The workspace's one selection (#162): a target, its entity or a node – or the spread or an entry from the tree's
 * top rows (#227) – read and written by the tree, the stage (picking, the gizmo, the outline) and the Inspector:
 * selecting in one selects in the others. Nothing else selected is the spread (#229): a fresh workspace, a click on
 * the stage that picks nothing and the tree's top row all select it – its row highlighted, no outline, no gizmo, the
 * Inspector showing it. The rules are `selection.ts`; the workspace page resets it when it opens and on another spread.
 */
class Selection implements SelectionState {
  target = $state<string | null>(null);
  node = $state<number[]>([]);
  onTarget = $state(true);
  /** The spread is selected (the tree's top row, or nothing else): the Inspector shows it */
  spread = $state(true);
  /** The selected entry's id: the Inspector shows the entry; `target` is its target (or null) */
  entry = $state<string | null>(null);

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

  /** Any selection; one of nothing is the spread's */
  set(next: SelectionState): void {
    const settled = settledSelection(next);
    this.target = settled.target;
    this.node = settled.node;
    this.onTarget = settled.onTarget;
    this.spread = settled.spread ?? false;
    this.entry = settled.entry ?? null;
  }

  /** A click on the stage that picks nothing: the spread is selected (the tree, the stage and the Inspector follow) */
  clear(): void {
    this.selectSpread();
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

  /** A fresh workspace, another spread, the selected target removed: the spread */
  reset(): void {
    this.selectSpread();
  }
}

export const selection = new Selection();
