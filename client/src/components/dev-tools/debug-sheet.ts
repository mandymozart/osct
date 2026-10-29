/**
 * The shared frame of the debug panels that slide up from the bottom – trial, camera and load test: the debug
 * bar at the top turned upside down (flat on the bottom edge, .25rem in from the sides, rounded top corners), a top
 * bar with a grab handle that sets the height by dragging (stored per panel on this device), and a body below it that
 * scrolls. A panel renders `<div class="bar">…</div>` and `<div class="body">…</div>` into its shadow root with
 * `SHEET_CSS` first in its styles, and hands its host and shadow root to a `BottomSheet`.
 */

/** Frame, top bar with grab handle, scrolling body and the panels' common buttons */
export const SHEET_CSS = `
  :host {
    position: fixed; left: .25rem; right: .25rem; bottom: 0; padding-bottom: env(safe-area-inset-bottom);
    z-index: 10000; box-sizing: border-box; display: flex; flex-direction: column;
    border-radius: .5rem .5rem 0 0; background: rgba(0, 0, 0, .85); color: #0f0; font: .6875rem/1rem monospace;
    cursor: default; user-select: none; overflow: hidden;
  }
  .bar { flex: none; display: flex; align-items: center; gap: .25rem; min-height: 1.875rem; padding: .375rem .25rem 0;
    box-sizing: border-box; touch-action: none; cursor: ns-resize; position: relative; flex-wrap: wrap; }
  .bar::before { content: ""; position: absolute; left: 50%; top: .1875rem; width: 2rem; height: .1875rem;
    margin-left: -1rem; border-radius: .125rem; background: #0a0; }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: .25rem .5rem .5rem; }
  button { font: inherit; color: inherit; background: none; border: .0625rem solid #0f0; border-radius: .25rem;
    min-width: 1.75rem; height: 1.5rem; padding: 0 .375rem; cursor: pointer; touch-action: manipulation; }
  button.on { background: #0f0; color: #000; }
  .close { font-size: 1rem; }
`;

export interface SheetOptions {
  /** The panel's name for screen readers */
  label: string;
  /** Local storage key of the panel's height */
  heightKey: string;
  /** Height in px before the reader drags it */
  defaultHeight: () => number;
}

/** Only the bar itself drags – not its buttons and fields */
const isControl = (target: HTMLElement) => !!target.closest("button, select, input, textarea, a");

/** Lowest height: the top bar alone */
export const MIN_SHEET_HEIGHT = 30;

/**
 * Drag-to-resize and the dialog role for a panel's host. Re-rendering the bar during a drag would drop the pointer
 * capture, so panels render through `render()`, which waits until the drag ends.
 */
export class BottomSheet {
  private drag: { pointerId: number; startY: number; startHeight: number } | null = null;
  private pending: (() => void) | null = null;

  constructor(private readonly host: HTMLElement, private readonly root: ShadowRoot, private readonly options: SheetOptions) {}

  connect(): void {
    // Taps on the panel are UI, not taps on the AR scene or the camera picture (ArScene and tap to focus ignore dialogs)
    this.host.setAttribute("role", "dialog");
    this.host.setAttribute("aria-label", this.options.label);
    this.setHeight(this.storedHeight());
    this.root.addEventListener("pointerdown", this.onPointerDown);
    this.root.addEventListener("pointermove", this.onPointerMove);
    this.root.addEventListener("pointerup", this.onPointerUp);
    this.root.addEventListener("pointercancel", this.onPointerUp);
  }

  disconnect(): void {
    this.root.removeEventListener("pointerdown", this.onPointerDown);
    this.root.removeEventListener("pointermove", this.onPointerMove);
    this.root.removeEventListener("pointerup", this.onPointerUp);
    this.root.removeEventListener("pointercancel", this.onPointerUp);
    this.drag = null;
    this.pending = null;
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  /** Runs `draw` now, or once the drag ends (the last one wins) */
  render(draw: () => void): void {
    if (this.drag) this.pending = draw;
    else draw();
  }

  setHeight(height: number): void {
    const max = Math.round(window.innerHeight * 0.85);
    this.host.style.height = `${Math.max(MIN_SHEET_HEIGHT, Math.min(max, Math.round(height)))}px`;
  }

  private storedHeight(): number {
    try {
      const value = Number(localStorage.getItem(this.options.heightKey));
      if (value >= MIN_SHEET_HEIGHT) return value;
    } catch {
      // storage blocked: the default
    }
    return this.options.defaultHeight();
  }

  /** Dragging the top bar (not its controls) sets the height: up = taller */
  private onPointerDown = (event: Event) => {
    const pointer = event as PointerEvent;
    const target = pointer.target as HTMLElement;
    const bar = target.closest<HTMLElement>(".bar");
    if (!bar || isControl(target)) return;
    this.drag = { pointerId: pointer.pointerId, startY: pointer.clientY, startHeight: this.host.getBoundingClientRect().height };
    try {
      bar.setPointerCapture(pointer.pointerId);
    } catch {
      // No capture (pointer already gone): the drag still follows moves over the panel
    }
    pointer.preventDefault();
  };

  private onPointerMove = (event: Event) => {
    const pointer = event as PointerEvent;
    if (!this.drag || pointer.pointerId !== this.drag.pointerId) return;
    this.setHeight(this.drag.startHeight + this.drag.startY - pointer.clientY);
  };

  private onPointerUp = (event: Event) => {
    const pointer = event as PointerEvent;
    if (!this.drag || pointer.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    const pending = this.pending;
    this.pending = null;
    pending?.();
    try {
      localStorage.setItem(this.options.heightKey, String(Math.round(this.host.getBoundingClientRect().height)));
    } catch {
      // Storage blocked: the height stays for this session
    }
  };
}
