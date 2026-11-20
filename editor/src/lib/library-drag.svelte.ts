import type { Asset } from "./api";
import { dropFit, dropRowOf, type DropFit, type DropRow } from "./library-drag";

/**
 * Dragging a Library tile onto a tree row (#330) – pointer events, so a mouse and a finger on the iPad both drag: a mouse
 * moves 5 px, a finger (or pen) holds the tile still for a moment, then moves (a quick swipe still scrolls the
 * Library). While it drags, a label follows the pointer – the file's name and what a drop there does, or why it does
 * nothing –, the cursor says *copy* or *no-drop*, and the row under it carries `data-drop-state="ok" | "no"` (the tree
 * styles it). A drop that fits calls the workspace's `ondrop` (the scene page: the row is selected, its node takes the
 * file the way the Inspector's *Use* does, a target row's printed image becomes it). **The Library makes no link**: the
 * tile is the drag's source, the drop is the tree's action. A refused drop changes nothing; `refused` says why.
 */
class LibraryDrag {
  /** The file being dragged – null while none is */
  asset = $state<Asset | null>(null);
  /** The last refused drop's reason (the Library's notice line shows it) */
  refused = $state<string | null>(null);
  /** The workspace's drop: set by the scene page while its tree is there */
  ondrop: ((asset: Asset, row: DropRow) => void | Promise<void>) | null = null;
}

export const libraryDrag = new LibraryDrag();

const MOUSE_PX = 5;
const HOLD_MS = 350;
const HOLD_SLOP_PX = 8;

/**
 * Starts watching a press on a tile (its `pointerdown`): it becomes a drag after a mouse's 5 px or a finger's hold. The
 * tile's own click, double click and menu stay as they are while no drag starts.
 */
export const pressTile = (event: PointerEvent, asset: Asset, label: string): void => {
  if (event.button !== 0 || !libraryDrag.ondrop) return;
  const mouse = event.pointerType === "mouse";
  const start = { x: event.clientX, y: event.clientY };
  const id = event.pointerId;
  let active = false;
  let ghost: HTMLDivElement | null = null;
  let row: HTMLElement | null = null;
  let fit: DropFit | null = null;
  let hold = 0;

  const mark = (next: HTMLElement | null, state: "ok" | "no" | null) => {
    if (row && row !== next) delete row.dataset.dropState;
    row = next;
    if (row) {
      if (state) row.dataset.dropState = state;
      else delete row.dataset.dropState;
    }
  };
  const draw = (x: number, y: number) => {
    if (!ghost) return;
    ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
    const line = ghost.lastElementChild as HTMLElement;
    line.textContent = fit ? fit.text : "drop on a node or a target in the tree";
    ghost.dataset.state = fit ? (fit.ok ? "ok" : "no") : "";
    document.documentElement.style.cursor = fit ? (fit.ok ? "copy" : "no-drop") : "grabbing";
  };
  const begin = () => {
    active = true;
    libraryDrag.asset = asset;
    libraryDrag.refused = null;
    ghost = document.createElement("div");
    ghost.className = "library-drag-ghost";
    ghost.setAttribute("aria-live", "polite");
    const name = document.createElement("b");
    name.textContent = label;
    ghost.append(name, document.createElement("span"));
    document.body.appendChild(ghost);
    document.documentElement.classList.add("library-dragging");
  };
  const over = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]") ?? null;
    const target = element ? dropRowOf(element.dataset) : null;
    fit = dropFit(asset, target);
    mark(element, fit ? (fit.ok ? "ok" : "no") : null);
    draw(x, y);
  };
  /** A held finger: the page does not scroll while it drags */
  const still = (e: TouchEvent) => { if (active) e.preventDefault(); };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (!active) {
      if (mouse && distance >= MOUSE_PX) begin();
      else if (!mouse && distance > HOLD_SLOP_PX) return end(); // a swipe: the Library scrolls
      else return;
    }
    over(e.clientX, e.clientY);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const landed = active && e.type === "pointerup" ? fit : null;
    const target = row ? dropRowOf(row.dataset) : null;
    end();
    if (!landed) return;
    if (landed.ok && target) void libraryDrag.ondrop?.(asset, target);
    else if (!landed.ok) libraryDrag.refused = landed.text;
  };
  /** The click that ends a drag selects nothing */
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const end = () => {
    clearTimeout(hold);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    window.removeEventListener("touchmove", still);
    if (active) {
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    }
    mark(null, null);
    ghost?.remove();
    ghost = null;
    document.documentElement.style.cursor = "";
    document.documentElement.classList.remove("library-dragging");
    if (active) libraryDrag.asset = null;
    active = false;
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  if (!mouse) {
    window.addEventListener("touchmove", still, { passive: false });
    hold = window.setTimeout(() => {
      begin();
      over(start.x, start.y);
    }, HOLD_MS);
  }
};
