import { added, allItems, extended, inverted, itemKey, itemOf, itemSelection, type MultiSelection, parentSelection, ranged, removed, type SelectionItem, selectionLevel, settledSelection, toggled, type SelectionLevel, type SelectionState, type SurfaceRef } from "./selection";

/**
 * The workspace's one selection (#162): a target, its entity or a node – or the scene or an entry from the tree's
 * top rows (#227) – read and written by the tree, the stage (picking, the gizmo, the outline) and the Inspector:
 * selecting in one selects in the others. Nothing else selected is the scene (#229): a fresh workspace, a click on
 * the stage that picks nothing and the tree's top row all select it – its row highlighted, no outline, no gizmo, the
 * Inspector showing it. The top bar's ⚙ after the experience's crumb selects the experience (#237). The rules are `selection.ts`; the workspace
 * page calls `enter` when it opens and on another scene: the selection asked for there (`requestOn` – the header search
 * picks on another scene, #237), else the scene. `reveal` counts the asks to show the selection in the Inspector.
 */
class Selection implements SelectionState {
  target = $state<string | null>(null);
  node = $state<number[]>([]);
  onTarget = $state(true);
  /** The scene is selected (the tree's top row, or nothing else): the Inspector shows it */
  scene = $state(true);
  /** The selected entry's id: the Inspector shows the entry; `target` is its target (or null) */
  entry = $state<string | null>(null);
  /** The experience is selected (#237): the Inspector shows its texts and settings */
  experience = $state(false);
  /** A group is selected (#307 – a band of the Scenes panel): the Inspector shows the group */
  group = $state<string | null>(null);
  /** A surface of a scene is selected (#314): the Inspector shows it, the stage highlights it */
  surface = $state<SurfaceRef | null>(null);
  /**
   * The rest of a multi-selection (#369, Blender's): selected besides the active one – the fields above, which the
   * Inspector shows and the gizmo holds. Any single selection (`set`) clears it.
   */
  others = $state<SelectionItem[]>([]);
  /** Goes up whenever something asks the workspace to show the selection in the Inspector (the search, the experience's ⚙) */
  reveal = $state(0);
  /** A selection asked for on a scene whose workspace is not open yet */
  private pending: { sceneId: string; state: SelectionState } | null = null;

  /** The target itself (its target fields, the print outlined on the stage) */
  selectTarget(target: string | null): void {
    this.set({ target, node: [], onTarget: true });
  }

  /** A node of the target's entity (`[]` = the root, the entity) */
  selectNode(target: string, path: number[]): void {
    this.set({ target, node: path, onTarget: false });
  }

  /** The scene itself: no target and no node selected on the stage */
  selectScene(): void {
    this.set({ target: null, node: [], onTarget: true, scene: true });
  }

  /** An entry; with a target the stage outlines its print, as for a selected target */
  selectEntry(entry: string, target: string | null): void {
    this.set({ target, node: [], onTarget: true, entry });
  }

  /** The experience: its texts and settings in the Inspector, nothing on the stage */
  selectExperience(): void {
    this.set({ target: null, node: [], onTarget: true, experience: true });
  }

  /** A group of scenes: its label, its scenes and targets in the Inspector, nothing on the stage */
  selectGroup(group: string): void {
    this.set({ target: null, node: [], onTarget: true, group });
  }

  /** A surface of a scene (#314): its fields in the Inspector, highlighted on the stage */
  selectSurface(scene: string, id: string): void {
    this.set({ target: null, node: [], onTarget: true, surface: { scene, id } });
  }

  /** Select `state` now and ask the workspace to show it in the Inspector */
  show(state: SelectionState): void {
    this.set(state);
    this.reveal += 1;
  }

  /** Select `state` once the workspace of `sceneId` opens (`enter`) */
  requestOn(sceneId: string, state: SelectionState): void {
    this.pending = { sceneId, state };
  }

  /** The workspace opens on (or moves to) a scene: the selection asked for there, shown in the Inspector – else the scene */
  enter(sceneId: string): void {
    const pending = this.pending;
    this.pending = null;
    if (pending && pending.sceneId === sceneId) this.show(pending.state);
    else this.reset();
  }

  /** Any selection; one of nothing is the scene's. One thing: the rest of a multi-selection is let go */
  set(next: SelectionState): void {
    this.others = [];
    this.assign(next);
  }

  private assign(next: SelectionState): void {
    const settled = settledSelection(next);
    this.target = settled.target;
    this.node = settled.node;
    this.onTarget = settled.onTarget;
    this.scene = settled.scene ?? false;
    this.entry = settled.entry ?? null;
    this.experience = settled.experience ?? false;
    this.group = settled.group ?? null;
    this.surface = settled.surface ?? null;
  }

  // ── Multi-select (#369): the rules are `selection.ts`'s, Blender's viewport and outliner ──

  /** The selection as active one and the rest */
  multi(): MultiSelection {
    return { active: itemOf(this.snapshot()), others: [...this.others] };
  }

  /** Every selected item, the active one first; empty = the scene (or a group, the experience) */
  items(): SelectionItem[] {
    return allItems(this.multi());
  }

  /** Several things are selected */
  get many(): boolean {
    return this.others.length > 0;
  }

  /** The item is selected, active or not */
  has(item: SelectionItem): boolean {
    const key = itemKey(item);
    return this.items().some(other => itemKey(other) === key);
  }

  /** The item is selected but not the active one (the tree marks it lighter, the stage outlines it darker) */
  isOther(item: SelectionItem): boolean {
    const key = itemKey(item);
    return this.others.some(other => itemKey(other) === key);
  }

  /** Set a multi-selection: the active one into the fields, the rest beside it; none active = the scene */
  apply(multi: MultiSelection): void {
    if (!multi.active) {
      this.set({ target: null, node: [], onTarget: true, scene: true });
      return;
    }
    this.assign(itemSelection(multi.active));
    const key = itemKey(multi.active);
    this.others = multi.others.filter(item => itemKey(item) !== key);
  }

  /** Shift + click on the stage (Blender's viewport) */
  extend(item: SelectionItem): void {
    this.apply(extended(this.multi(), item));
  }

  /** Ctrl + click in the tree (Blender's outliner) */
  toggle(item: SelectionItem): void {
    this.apply(toggled(this.multi(), item));
  }

  /** Shift + click in the tree: the rows from the active one to `item`, in the tree's order */
  range(item: SelectionItem, rows: readonly SelectionItem[]): void {
    this.apply(ranged(this.multi(), item, rows));
  }

  /** A box (B + drag): added, or removed with Shift */
  box(items: readonly SelectionItem[], remove: boolean): void {
    this.apply(remove ? removed(this.multi(), items) : added(this.multi(), items));
  }

  /** A: everything of the open scene (`all`) selected, the active one stays */
  selectAll(all: readonly SelectionItem[]): void {
    this.apply(added(this.multi(), all));
  }

  /** Ctrl + I: the selection inverted among `all` */
  invert(all: readonly SelectionItem[]): void {
    this.apply(inverted(this.multi(), all));
  }

  /** A click on the stage that picks nothing: the scene is selected (the tree, the stage and the Inspector follow) */
  clear(): void {
    this.selectScene();
  }

  /** One level up (the breadcrumb, ← in the tree) */
  up(): void {
    // The fields one by one: a class's state fields are accessors, a scene of `this` would not copy them
    this.set(parentSelection(this.snapshot()));
  }

  /** The selection as a plain value */
  snapshot(): SelectionState {
    return { target: this.target, node: this.node, onTarget: this.onTarget, scene: this.scene, entry: this.entry, ...(this.experience ? { experience: true } : {}), ...(this.group ? { group: this.group } : {}), ...(this.surface ? { surface: { ...this.surface } } : {}) };
  }

  level(hasTree: boolean): SelectionLevel {
    return selectionLevel(this, hasTree);
  }

  /** A fresh workspace, another scene, the selected target removed: the scene */
  reset(): void {
    this.selectScene();
  }
}

export const selection = new Selection();
