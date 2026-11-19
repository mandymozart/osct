import { readStoredJson, writeStoredJson } from "#lib/storage.js";
import {
  defaultPlace, evade, layout, moved, placeOf, raise, readPlaces, resized, settle, settleSize, wantOf, withPlaces,
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

  constructor(readonly workspace: string, readonly specs: readonly PanelSpec[]) {
    this.places = readPlaces(readStoredJson(PANELS_KEY), workspace, specs);
    this.order = specs.map(s => s.id);
  }

  /** While a resize lasts the views are its own (`evade`, once per frame) – no layout of all the panels */
  readonly views: Record<string, View> = $derived.by(() => this.held?.views ?? layout({
    specs: this.specs, places: this.resolved, shown: this.shown, area: this.area, m: this.metrics, measured: this.measured, asks: this.asks,
    held: this.held && this.held.moved ? { id: this.held.id, rect: this.held.rect } : null,
  }));

  /** Every panel's place: the stored one, else its default */
  get resolved(): Record<string, Place> {
    return Object.fromEntries(this.specs.map(s => [s.id, this.places[s.id] ?? defaultPlace(s, this.metrics)]));
  }

  spec(id: string): PanelSpec | undefined {
    return this.specs.find(s => s.id === id);
  }

  place(id: string): Place {
    const spec = this.spec(id);
    return this.places[id] ?? (spec ? defaultPlace(spec, this.metrics) : { corner: "top-left", dx: 0, dy: 0 });
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
    return !!this.place(id).closed;
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

  /** Close a panel (an essential one only folds) */
  close(id: string): void {
    if (this.spec(id)?.essential) return;
    this.set(id, { ...this.place(id), closed: true });
  }

  /** Bring a closed or folded panel back, open */
  reopen(id: string): void {
    this.set(id, { ...this.place(id), closed: false, collapsed: false });
    this.front(id);
  }

  /** The panels menu: an open panel closes, a closed one comes back */
  flip(id: string): void {
    if (this.closed(id)) this.reopen(id);
    else this.close(id);
  }

  /** The panels that close, whether each is open – the panels menu's list */
  closable(): Array<{ id: string; name: string; icon: string; open: boolean }> {
    return this.specs.filter(s => !s.essential).map(s => ({ id: s.id, name: s.name, icon: s.icon, open: !this.closed(s.id) }));
  }

  /** Every panel back at its default place and size (the stored layout of this workspace goes) */
  reset(): void {
    this.places = {};
    this.order = this.specs.map(s => s.id);
    writeStoredJson(PANELS_KEY, withPlaces(readStoredJson(PANELS_KEY), this.workspace, null));
  }

  private save(): void {
    writeStoredJson(PANELS_KEY, withPlaces(readStoredJson(PANELS_KEY), this.workspace, this.places));
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
    if (h.kind === "move") {
      const rect = settle(h.rect, others, this.area, gap);
      this.set(h.id, { ...old, ...placeOf(rect, this.area) });
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
