import { parentSelection, selectionLevel, settledSelection, type SelectionLevel, type SelectionState } from "./selection";

/**
 * The workspace's one selection (#162): a target, its entity or a node – or the spread or an entry from the tree's
 * top rows (#227) – read and written by the tree, the stage (picking, the gizmo, the outline) and the Inspector:
 * selecting in one selects in the others. Nothing else selected is the spread (#229): a fresh workspace, a click on
 * the stage that picks nothing and the tree's top row all select it – its row highlighted, no outline, no gizmo, the
 * Inspector showing it. The top bar's book crumb selects the book (#237). The rules are `selection.ts`; the workspace
 * page calls `enter` when it opens and on another spread: the selection asked for there (`requestOn` – the header search
 * picks on another spread, #237), else the spread. `reveal` counts the asks to show the selection in the Inspector.
 */
class Selection implements SelectionState {
  target = $state<string | null>(null);
  node = $state<number[]>([]);
  onTarget = $state(true);
  /** The spread is selected (the tree's top row, or nothing else): the Inspector shows it */
  spread = $state(true);
  /** The selected entry's id: the Inspector shows the entry; `target` is its target (or null) */
  entry = $state<string | null>(null);
  /** The book is selected (#237): the Inspector shows its texts and settings */
  book = $state(false);
  /** Goes up whenever something asks the workspace to show the selection in the Inspector (the search, the book crumb) */
  reveal = $state(0);
  /** A selection asked for on a spread whose workspace is not open yet */
  private pending: { spreadId: string; state: SelectionState } | null = null;

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

  /** The book: its texts and settings in the Inspector, nothing on the stage */
  selectBook(): void {
    this.set({ target: null, node: [], onTarget: true, book: true });
  }

  /** Select `state` now and ask the workspace to show it in the Inspector */
  show(state: SelectionState): void {
    this.set(state);
    this.reveal += 1;
  }

  /** Select `state` once the workspace of `spreadId` opens (`enter`) */
  requestOn(spreadId: string, state: SelectionState): void {
    this.pending = { spreadId, state };
  }

  /** The workspace opens on (or moves to) a spread: the selection asked for there, shown in the Inspector – else the spread */
  enter(spreadId: string): void {
    const pending = this.pending;
    this.pending = null;
    if (pending && pending.spreadId === spreadId) this.show(pending.state);
    else this.reset();
  }

  /** Any selection; one of nothing is the spread's */
  set(next: SelectionState): void {
    const settled = settledSelection(next);
    this.target = settled.target;
    this.node = settled.node;
    this.onTarget = settled.onTarget;
    this.spread = settled.spread ?? false;
    this.entry = settled.entry ?? null;
    this.book = settled.book ?? false;
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
    return { target: this.target, node: this.node, onTarget: this.onTarget, spread: this.spread, entry: this.entry, ...(this.book ? { book: true } : {}) };
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
