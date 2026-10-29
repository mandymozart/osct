import { parentSelection, selectionLevel, type SelectionLevel, type SelectionState } from "./selection";

/**
 * The workspace's one selection (#162): a target, its entity or a node, read and written by the tree, the stage
 * (picking, the gizmo, the outline) and the Entity panel – selecting in one selects in the others. The rules are
 * `selection.ts`; the workspace page resets it when it opens.
 */
class Selection implements SelectionState {
  target = $state<string | null>(null);
  node = $state<number[]>([]);
  onTarget = $state(true);

  /** The target itself (its target fields, the print outlined on the stage) */
  selectTarget(target: string | null): void {
    this.set({ target, node: [], onTarget: true });
  }

  /** A node of the target's entity (`[]` = the root, the entity) */
  selectNode(target: string, path: number[]): void {
    this.set({ target, node: path, onTarget: false });
  }

  set(next: SelectionState): void {
    this.target = next.target;
    this.node = next.node;
    this.onTarget = next.onTarget;
  }

  /** One level up (the breadcrumb, ← in the tree) */
  up(): void {
    this.set(parentSelection(this));
  }

  level(hasTree: boolean): SelectionLevel {
    return selectionLevel(this, hasTree);
  }

  reset(): void {
    this.set({ target: null, node: [], onTarget: true });
  }
}

export const selection = new Selection();
