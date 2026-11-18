import { readStoredJson, writeStoredJson } from "#lib/storage.js";
import {
  defaultPlace, layout, moved, placeOf, raise, readPlaces, resized, settle, settleSize, wantOf, withPlaces,
  type Edge, type Metrics, type PanelSpec, type Place, type Rect, type Size, type View,
} from "./floats.js";

/** Every workspace's panel places in this browser: `{ [workspace]: { [panel]: Place } }` */
export const PANELS_KEY = "osct-editor-panels";

/** A press that moves less than this (px) is a click, not a drag */
const CLICK_PX = 4;

/**
 * One workspace's floating panels (#308): the specs, where the person left each panel (stored per workspace,
 * `PANELS_KEY`), what the page draws now, the room and the measures – and the panel in the hand. `views` is the
 * layout (`floats.ts`); `FloatingPanel.svelte` draws one panel and calls `grab` / `drag` / `drop`. The top bar's panels
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
  /** The panel in the hand: a move or a resize, from where it started */
  held = $state<{ id: string; kind: "move" | "size"; edge: Edge; start: Rect; from: [number, number]; rect: Rect; moved: boolean } | null>(null);

  constructor(readonly workspace: string, readonly specs: readonly PanelSpec[]) {
    this.places = readPlaces(readStoredJson(PANELS_KEY), workspace, specs);
    this.order = specs.map(s => s.id);
  }

  readonly views: Record<string, View> = $derived.by(() => layout({
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
    this.front(id);
    this.held = { id, kind: edge ? "size" : "move", edge: edge ?? { x: 0, y: 0 }, start: view.rect, from: [x, y], rect: view.rect, moved: false };
  }

  /** The pointer moved while a panel is held */
  drag(x: number, y: number): void {
    const h = this.held;
    if (!h) return;
    const dx = x - h.from[0];
    const dy = y - h.from[1];
    if (!h.moved && Math.hypot(dx, dy) < CLICK_PX) return;
    const spec = this.spec(h.id);
    if (!spec) return;
    const min = this.minOf(spec);
    const rect = h.kind === "move" ? moved(h.start, dx, dy, this.area) : resized(h.start, h.edge, dx, dy, min, this.area);
    this.held = { ...h, rect, moved: true };
  }

  /** Let go: the panel settles (snapped, never on another) and its place is kept. True when it was a drag, not a click */
  drop(): boolean {
    const h = this.held;
    if (!h) return false;
    this.held = null;
    if (!h.moved) return false;
    const spec = this.spec(h.id);
    if (!spec) return true;
    const others = Object.entries(this.views).filter(([id]) => id !== h.id).map(([, v]) => v.rect);
    const { gap } = this.metrics;
    const old = this.place(h.id);
    if (h.kind === "move") {
      const rect = settle(h.rect, others, this.area, gap);
      this.set(h.id, { ...old, ...placeOf(rect, this.area) });
    } else {
      const rect = settleSize(h.rect, h.edge, others, this.minOf(spec), this.area, gap);
      this.set(h.id, { ...old, ...placeOf(rect, this.area), size: { w: Math.round(rect.w), h: Math.round(rect.h) } });
    }
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
