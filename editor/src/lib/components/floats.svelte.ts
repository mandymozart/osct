import { readStoredJson, writeStoredJson } from "#lib/storage.js";
import {
  closePanel, closeTab, FLOAT_ID, holderOf, holdsEssential, migrate, moveTab, nextFloatId, openTab, readArrangement, sameSpot,
  selectTab, splitOut, storedArrangement, TABS_KEY, type Arrangement, type TabSpec,
} from "./float-tabs.js";
import {
  at, clampInto, defaultPlace, evade, layout, moved, placeOf, raise, readPlaces, resized, settleSize, wantOf, withPlaces,
  type Edge, type Metrics, type Neighbour, type PanelSpec, type Place, type Rect, type Size, type View,
} from "./floats.js";

/** Every workspace's panel places in this browser: `{ [workspace]: { [panel]: Place } }` */
export const PANELS_KEY = "osct-editor-panels";

/** A press that moves less than this (px) is a click, not a drag */
const CLICK_PX = 4;

/** The panel in the hand: a move or a resize, from where it started */
interface Held {
  id: string;
  kind: "move" | "size";
  edge: Edge;
  start: Rect;
  from: [number, number];
  rect: Rect;
  moved: boolean;
  /** A resize (#329): every panel's view when it started and its least size – what `evade` lays out from */
  base?: Record<string, View>;
  neighbours?: Neighbour[];
  /** A resize: the views while it lasts – the base's own objects where a panel did not move, so it is not drawn again */
  views?: Record<string, View>;
}

/** A tab in the hand (#318): from which panel, where the pointer is, where it would land (null: out on the stage) */
export interface TabHeld {
  tab: string;
  from: string;
  start: [number, number];
  at: [number, number];
  moved: boolean;
  /** The panel and the index it lands at; null: dropped on the stage, a panel of its own */
  target: { panel: string; index: number } | null;
}

/** A panel a dragged-out tab made: its least size (rem) and the size it starts with at most (rem) */
const FLOAT_MIN = { w: 12, h: 8 };
const FLOAT_SIZE = { w: 24, h: 24 };

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/**
 * One workspace's floating panels (#308): the specs, where the person left each panel (stored per workspace,
 * `PANELS_KEY`), what the page draws now, the room and the measures – and the panel in the hand. `views` is the
 * layout (`floats.ts`); `FloatingPanel.svelte` draws one panel and calls `grab` / `drag` / `drop`. A drag is laid out
 * once per animation frame (the pointer events between coalesce) and stored only when it ends (#329). The top bar's panels
 * menu reaches the workspace shown through `openFloats`.
 */
export class Floats {
  /** The places the person left (px); a panel without one is at its spec's default place */
  places = $state<Record<string, Place>>({});
  /** The room for panels (px) */
  area = $state<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  metrics = $state<Metrics>({ rem: 16, gap: 8, head: 32, button: 28, char: 7.5 });
  /** The panels the page draws now (registered by `FloatingPanel`) */
  shown = $state<Set<string>>(new Set());
  /** What `content` dimensions measured (px) */
  measured = $state<Record<string, Size>>({});
  /** Sizes asked for now instead of the spec's */
  asks = $state<Record<string, PanelSpec["size"]>>({});
  /** Front to back: the panel touched last lies over the others */
  order = $state<string[]>([]);
  /** The panel in the hand (replaced whole, never changed inside: raw) */
  held = $state.raw<Held | null>(null);
  /** The pointer's last place not laid out yet, and the animation frame that will (pointer events coalesce, #329) */
  private pending: [number, number] | null = null;
  private frame = 0;
  /** How many layouts of the hand ran: one per animation frame, however many pointer events came (#329, the tests) */
  passes = 0;

  /** Which panel holds which tabs (#318; none: a workspace without tabs) */
  arrangement = $state<Arrangement>({});
  /** The tab in the hand (replaced whole: raw) */
  tabHeld = $state.raw<TabHeld | null>(null);

  /**
   * `tabs` (#318): the contents that are tabs, each with its home panel (a spec); `legacyTab` is the tab the Inspector
   * showed before #318 (`osct-editor-tab`) – a layout stored then becomes an arrangement (`migrate`)
   */
  constructor(readonly workspace: string, readonly baseSpecs: readonly PanelSpec[], readonly tabs: readonly TabSpec[] = [], legacyTab: string | null = null) {
    const stored = readStoredJson(PANELS_KEY);
    const mine = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>)[workspace] : undefined;
    const own = typeof mine === "object" && mine !== null ? (mine as Record<string, unknown>) : {};
    if (tabs.length) {
      this.arrangement = readArrangement(own[TABS_KEY], tabs, baseSpecs.map(s => s.id))
        ?? migrate(own as Record<string, { closed?: boolean }>, tabs, this.closedByDefault(), legacyTab);
    }
    const places = readPlaces(stored, workspace, this.specs);
    // A tab panel is open while it holds tabs: a `closed` stored before #318 is the arrangement's now
    for (const [id, place] of Object.entries(places)) {
      if (this.isTabPanel(id) && place.closed !== undefined) {
        const { closed: _closed, ...rest } = place;
        places[id] = rest;
      }
    }
    this.places = places;
    this.order = this.specs.map(s => s.id);
  }

  /** The panels: the workspace's specs – a tab panel named after the tab it shows – and the panels dragged-out tabs made */
  readonly specs: readonly PanelSpec[] = $derived.by(() => {
    if (!this.tabs.length) return this.baseSpecs;
    const named = (spec: PanelSpec): PanelSpec => {
      const h = this.arrangement[spec.id];
      const t = h ? this.tabSpec(h.active) : undefined;
      return t ? { ...spec, name: t.name, icon: t.icon, about: t.about, essential: holdsEssential(this.arrangement, spec.id, this.tabs) } : { ...spec, essential: false };
    };
    const homes = new Set(this.tabs.map(t => t.home));
    const made = Object.keys(this.arrangement).filter(id => FLOAT_ID.test(id)).map(id => named({
      id, name: id, icon: "panels", about: "", place: at("top-left", 0, 0), size: FLOAT_SIZE, min: FLOAT_MIN,
    }));
    return [...this.baseSpecs.map(s => (homes.has(s.id) ? named(s) : s)), ...made];
  });

  private closedByDefault(): Set<string> {
    return new Set(this.baseSpecs.filter(s => s.place.closed).map(s => s.id));
  }

  tabSpec(id: string): TabSpec | undefined {
    return this.tabs.find(t => t.id === id);
  }

  /** A panel that holds tabs (a home panel of a tab or one a dragged-out tab made) – not the toolbar */
  isTabPanel(id: string): boolean {
    return !!this.tabs.length && (FLOAT_ID.test(id) || this.tabs.some(t => t.home === id));
  }

  /** The tab panels open now, in their order */
  get tabPanels(): string[] {
    return Object.keys(this.arrangement);
  }

  /** The panel showing `tab` now (null: closed, or behind another tab of its panel) */
  showing(tab: string): string | null {
    const at = holderOf(this.arrangement, tab);
    return at && this.arrangement[at].active === tab ? at : null;
  }

  /** The panel holding `tab` (null: closed) */
  holder(tab: string): string | null {
    return holderOf(this.arrangement, tab);
  }

  private arrange(next: Arrangement): void {
    if (next === this.arrangement) return;
    this.arrangement = next;
    this.save();
  }

  /** A panel shows one of its tabs */
  selectTab(panel: string, tab: string): void {
    this.arrange(selectTab(this.arrangement, panel, tab));
  }

  /** Show a tab where it is – a closed one comes back into its home panel; `unfold`: a folded panel opens for it */
  showTab(tab: string, unfold = false): void {
    this.arrange(openTab(this.arrangement, tab, this.tabs));
    const at = this.holder(tab);
    if (!at) return;
    if (unfold && this.collapsed(at)) this.setCollapsed(at, false);
    else this.front(at);
  }

  /** While a resize lasts the views are its own (`evade`, once per frame) – no layout of all the panels */
  readonly views: Record<string, View> = $derived.by(() => this.held?.views ?? layout({
    specs: this.specs, places: this.resolved, shown: this.shown, area: this.area, m: this.metrics, measured: this.measured, asks: this.asks,
    held: this.held && this.held.moved ? { id: this.held.id, rect: this.held.rect } : null,
  }));

  /** Every panel's place: the stored one, else its default */
  get resolved(): Record<string, Place> {
    return Object.fromEntries(this.specs.map(s => [s.id, this.place(s.id)]));
  }

  spec(id: string): PanelSpec | undefined {
    return this.specs.find(s => s.id === id);
  }

  place(id: string): Place {
    const spec = this.spec(id);
    const place = this.places[id] ?? (spec ? defaultPlace(spec, this.metrics) : { corner: "top-left", dx: 0, dy: 0 });
    // A tab panel is open while it holds tabs (#318): its spec's `closed` (History, Logic start closed) is the
    // arrangement's – kept in the place, the panel opened from the menu had no view and never showed
    if (place.closed === undefined || !this.isTabPanel(id)) return place;
    const { closed: _closed, ...open } = place;
    return open;
  }

  /** The z-index of a panel (1 = the back) */
  z(id: string): number {
    return this.order.indexOf(id) + 1;
  }

  // ── what the page draws ──

  show(id: string): void {
    if (!this.shown.has(id)) this.shown = new Set([...this.shown, id]);
  }

  hide(id: string): void {
    if (!this.shown.has(id)) return;
    const next = new Set(this.shown);
    next.delete(id);
    this.shown = next;
  }

  measure(id: string, size: Size): void {
    const was = this.measured[id];
    if (was && Math.abs(was.w - size.w) < 0.5 && Math.abs(was.h - size.h) < 0.5) return;
    this.measured = { ...this.measured, [id]: size };
  }

  // ── folded, closed, reset ──

  private set(id: string, place: Place): void {
    this.places = { ...this.places, [id]: place };
    this.save();
  }

  collapsed(id: string): boolean {
    return !!this.place(id).collapsed;
  }

  closed(id: string): boolean {
    return this.isTabPanel(id) ? !this.arrangement[id] : !!this.place(id).closed;
  }

  setCollapsed(id: string, collapsed: boolean): void {
    this.set(id, { ...this.place(id), collapsed });
    this.front(id);
  }

  /** An inline panel (a toolbar) is one column instead of one row */
  vertical(id: string): boolean {
    return !!(this.spec(id)?.inline && this.place(id).vertical);
  }

  /** Turn a toolbar between a row and a column (#315): a size it was resized to belongs to the other way, so it goes */
  setVertical(id: string, vertical: boolean): void {
    // `vertical` goes with the rest: kept in `place`, a column could never turn back into a row (#328)
    const { size: _size, collapsed: _collapsed, vertical: _vertical, ...place } = this.place(id);
    this.set(id, vertical ? { ...place, vertical } : place);
    this.front(id);
  }

  /** Close a panel (an essential one only folds); a tab panel closes with its tabs – not while it holds the Inspector */
  close(id: string): void {
    if (this.isTabPanel(id)) return this.arrange(closePanel(this.arrangement, id, this.tabs));
    if (this.spec(id)?.essential) return;
    this.set(id, { ...this.place(id), closed: true });
  }

  /** Bring a closed or folded panel back, open */
  reopen(id: string): void {
    this.set(id, { ...this.place(id), closed: false, collapsed: false });
    this.front(id);
  }

  /** The panels menu: an open panel – with tabs, an open tab – closes, a closed one comes back */
  flip(id: string): void {
    if (this.tabSpec(id)) {
      if (this.holder(id)) this.arrange(closeTab(this.arrangement, id, this.tabs));
      else this.showTab(id);
      return;
    }
    if (this.closed(id)) this.reopen(id);
    else this.close(id);
  }

  /** What closes, whether each is open – the panels menu's list: the tabs (not the essential ones), the other panels */
  closable(): Array<{ id: string; name: string; icon: string; open: boolean }> {
    const tabs = this.tabs.filter(t => !t.essential).map(t => ({ id: t.id, name: t.name, icon: t.icon, open: !!this.holder(t.id) }));
    const panels = this.specs.filter(s => !s.essential && !this.isTabPanel(s.id)).map(s => ({ id: s.id, name: s.name, icon: s.icon, open: !this.closed(s.id) }));
    return [...tabs, ...panels];
  }

  /** Every panel back at its default place and size, every tab in its home panel (the stored layout of this workspace goes) */
  reset(): void {
    this.places = {};
    if (this.tabs.length) this.arrangement = migrate({}, this.tabs, this.closedByDefault(), null);
    this.order = this.specs.map(s => s.id);
    writeStoredJson(PANELS_KEY, withPlaces(readStoredJson(PANELS_KEY), this.workspace, null));
  }

  private save(): void {
    if (!this.tabs.length) return writeStoredJson(PANELS_KEY, withPlaces(readStoredJson(PANELS_KEY), this.workspace, this.places));
    // The places of panels a drag made and that closed go with them
    const places = Object.fromEntries(Object.entries(this.places).filter(([id]) => !FLOAT_ID.test(id) || this.arrangement[id]));
    if (Object.keys(places).length !== Object.keys(this.places).length) this.places = places;
    const own = { ...places, [TABS_KEY]: storedArrangement(this.arrangement) } as unknown as Record<string, Place>;
    writeStoredJson(PANELS_KEY, withPlaces(readStoredJson(PANELS_KEY), this.workspace, own));
  }

  // ── a tab in the hand (#318): into another panel's head, before or after a tab, or out onto the stage ──

  grabTab(tab: string, from: string, x: number, y: number): void {
    const h = this.arrangement[from];
    if (!h?.tabs.includes(tab)) return;
    this.tabHeld = { tab, from, start: [x, y], at: [x, y], moved: false, target: { panel: from, index: h.tabs.indexOf(tab) } };
  }

  /** The pointer moved with a tab: where it would land (the panel hit-tests the heads; null: out on the stage) */
  dragTab(x: number, y: number, target: TabHeld["target"]): void {
    const h = this.tabHeld;
    if (!h) return;
    const moved = h.moved || Math.hypot(x - h.start[0], y - h.start[1]) >= CLICK_PX;
    this.tabHeld = { ...h, at: [x, y], moved, target };
  }

  /** Where a held tab lands now – null while it would change nothing (its own place, or no drag yet) */
  get tabDrop(): TabHeld["target"] | "out" | null {
    const h = this.tabHeld;
    if (!h || !h.moved) return null;
    if (!h.target) return "out";
    return sameSpot(this.arrangement, h.tab, h.target.panel, h.target.index) ? null : h.target;
  }

  /** Let go of a tab: it moves into the panel under it, or – on the stage – becomes a panel of its own there */
  dropTab(): boolean {
    const h = this.tabHeld;
    const drop = this.tabDrop;
    this.tabHeld = null;
    if (!h || !drop) return false;
    if (drop !== "out") {
      this.arrange(moveTab(this.arrangement, h.tab, drop.panel, drop.index));
      this.front(drop.panel);
      return true;
    }
    const id = nextFloatId(this.arrangement);
    const { rem, head } = this.metrics;
    const from = this.views[h.from]?.rect;
    const home = this.spec(this.tabSpec(h.tab)?.home ?? "")?.size;
    // The tab's home panel's size where it is a number, else the panel it left – at most 24rem and the room there is
    const dim = (d: unknown, was: number | undefined, most: number, room: number, least: number) =>
      Math.min(room, Math.max(least * rem, Math.min(typeof d === "number" ? d * rem : was ?? most * rem, most * rem)));
    const w = dim(home?.w, from?.w, FLOAT_SIZE.w, this.area.w, FLOAT_MIN.w);
    const hh = dim(home?.h, from?.h, FLOAT_SIZE.h, this.area.h, FLOAT_MIN.h);
    // Where it was dropped, free (#364): over the others if it lands there
    const rect = clampInto({ x: h.at[0] - 2 * rem, y: h.at[1] - head / 2, w, h: hh }, this.area);
    this.places = { ...this.places, [id]: { ...placeOf(rect, this.area), size: { w: Math.round(rect.w), h: Math.round(rect.h) }, free: true } };
    this.arrange(splitOut(this.arrangement, h.tab, id));
    this.order = raise(this.order, id);
    return true;
  }

  front(id: string): void {
    if (this.order.at(-1) !== id) this.order = raise(this.order, id);
  }

  // ── the hand: a move by the head, a resize by an edge ──

  /** A press on a panel's handle (`edge` null) or one of its edges */
  grab(id: string, x: number, y: number, edge: Edge | null = null): void {
    const view = this.views[id];
    if (!view) return;
    this.cancelFrame();
    this.front(id);
    const held: Held = { id, kind: edge ? "size" : "move", edge: edge ?? { x: 0, y: 0 }, start: view.rect, from: [x, y], rect: view.rect, moved: false };
    if (edge) {
      // A resize lays the others out from where they are now: each may move and shrink to its least size (#329)
      held.base = this.views;
      held.neighbours = Object.entries(this.views).map(([other, v]) => {
        const spec = this.spec(other);
        const min = v.collapsed || !spec ? { w: v.rect.w, h: v.rect.h } : this.minOf(spec);
        return { id: other, rect: v.rect, min: { w: Math.min(min.w, v.rect.w), h: Math.min(min.h, v.rect.h) } };
      });
    }
    this.held = held;
  }

  /**
   * The pointer moved while a panel is held: laid out at the next animation frame, once for all the events that came
   * before it (without frames – a test, a server – at once)
   */
  drag(x: number, y: number): void {
    if (!this.held) return;
    this.pending = [x, y];
    if (typeof requestAnimationFrame !== "function") return this.flush();
    if (!this.frame) this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.flush();
    });
  }

  /** Lay out the pointer's last place now */
  private flush(): void {
    const at = this.pending;
    this.cancelFrame();
    if (at) this.follow(at[0], at[1]);
  }

  private cancelFrame(): void {
    if (this.frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.pending = null;
  }

  /** One layout of the hand: the held panel where the pointer has it; a resize makes room among the others (`evade`) */
  private follow(x: number, y: number): void {
    const h = this.held;
    if (!h) return;
    const dx = x - h.from[0];
    const dy = y - h.from[1];
    if (!h.moved && Math.hypot(dx, dy) < CLICK_PX) return;
    const spec = this.spec(h.id);
    if (!spec) return;
    this.passes++;
    if (h.kind === "move") {
      this.held = { ...h, rect: moved(h.start, dx, dy, this.area), moved: true };
      return;
    }
    const target = resized(h.start, h.edge, dx, dy, this.minOf(spec), this.area);
    // A free panel (#364) moves no other
    if (this.place(h.id).free) {
      this.held = { ...h, rect: target, moved: true };
      return;
    }
    const base = h.base ?? {};
    const rects = evade(h.neighbours ?? [], h.id, target, h.edge, this.area, this.metrics.gap);
    const views = Object.fromEntries(Object.entries(base).map(([id, v]) => [id, sameRect(v.rect, rects[id]) ? v : { ...v, rect: rects[id] }]));
    this.held = { ...h, rect: rects[h.id], moved: true, views };
  }

  /**
   * Let go: a moved panel settles (snapped, never on another); a resized one keeps the room it made – the panels it
   * pushed keep their new places and sizes. Stored once, here. True when it was a drag, not a click
   */
  drop(): boolean {
    this.flush();
    const h = this.held;
    if (!h) return false;
    const views = this.views;
    this.held = null;
    if (!h.moved) return false;
    const spec = this.spec(h.id);
    if (!spec) return true;
    const others = Object.entries(views).filter(([id]) => id !== h.id).map(([, v]) => v.rect);
    const { gap } = this.metrics;
    const old = this.place(h.id);
    // Where it was let go, free (#364): no snapping, over the others if it lies there – only kept inside the stage. It
    // keeps the size it had (a toolbar follows its content)
    const size = { w: Math.round(h.rect.w), h: Math.round(h.rect.h) };
    if (h.kind === "move") {
      this.set(h.id, { ...old, ...placeOf(h.rect, this.area), ...(spec.inline || views[h.id]?.collapsed ? {} : { size }), free: true });
      return true;
    }
    if (old.free) {
      this.set(h.id, { ...old, ...placeOf(h.rect, this.area), size });
      return true;
    }
    const rect = settleSize(h.rect, h.edge, others, this.minOf(spec), this.area, gap);
    const places = { ...this.places, [h.id]: { ...old, ...placeOf(rect, this.area), size: { w: Math.round(rect.w), h: Math.round(rect.h) } } };
    for (const [id, v] of Object.entries(h.views ?? {})) {
      const was = h.base?.[id];
      if (id === h.id || !was || v === was) continue;
      // A pushed panel keeps its new place; one that shrank, its new size too
      const shrank = Math.abs(v.rect.w - was.rect.w) > 0.5 || Math.abs(v.rect.h - was.rect.h) > 0.5;
      const place = this.place(id);
      places[id] = { ...place, ...placeOf(v.rect, this.area), ...(shrank ? { size: { w: Math.round(v.rect.w), h: Math.round(v.rect.h) } } : {}) };
    }
    this.places = places;
    this.save();
    return true;
  }

  /** A panel's least open size (px) */
  private minOf(spec: PanelSpec): Size {
    return wantOf(spec, this.place(spec.id), this.metrics, this.measured[spec.id], this.asks[spec.id]).min;
  }

  /** A resized panel back to the size its content asks for (a double-click on an edge) */
  unsize(id: string): void {
    const { size: _size, ...rest } = this.place(id);
    this.set(id, rest);
  }
}

/** The workspace's panels the top bar's panels menu shows (null: the page has no floating panels) */
export const openFloats = $state<{ current: Floats | null }>({ current: null });
