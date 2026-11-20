/**
 * Dragging a node type from the Library's *Nodes* onto the Logic canvas (#334 L-T4) – pointer events like a file tile's
 * drag (`library-drag.svelte.ts`): a mouse moves 5 px, a finger holds first. A label follows the pointer; over the canvas
 * (`[data-drop="logic"]`) the drop calls the Logic panel's `ondrop` with the type and the point – the panel opens its add
 * menu there with that type's choices (one choice is applied at once), the same ops its right click offers. Without an open
 * Logic panel the drop says so and changes nothing.
 */
class LogicDrag {
  /** The type being dragged – null while none is */
  kind = $state<string | null>(null);
  /** The last refused drop's reason (the Library's Nodes list shows it) */
  refused = $state<string | null>(null);
  /** The Logic panel's drop: set while its canvas is there */
  ondrop: ((kind: string, at: { x: number; y: number }) => void) | null = null;
}

export const logicDrag = new LogicDrag();

const MOUSE_PX = 5;
const HOLD_MS = 350;
const HOLD_SLOP_PX = 8;

export const pressNodeType = (event: PointerEvent, kind: string, label: string): void => {
  if (event.button !== 0) return;
  const mouse = event.pointerType === "mouse";
  const start = { x: event.clientX, y: event.clientY };
  const id = event.pointerId;
  let active = false;
  let ghost: HTMLDivElement | null = null;
  let over = false;
  let hold = 0;

  const begin = () => {
    active = true;
    logicDrag.kind = kind;
    logicDrag.refused = null;
    ghost = document.createElement("div");
    ghost.className = "library-drag-ghost";
    ghost.setAttribute("aria-live", "polite");
    const name = document.createElement("b");
    name.textContent = label;
    ghost.append(name, document.createElement("span"));
    document.body.appendChild(ghost);
    document.documentElement.classList.add("library-dragging");
  };
  const draw = (x: number, y: number) => {
    over = !!document.elementFromPoint(x, y)?.closest('[data-drop="logic"]');
    if (!ghost) return;
    ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
    (ghost.lastElementChild as HTMLElement).textContent = over ? (logicDrag.ondrop ? "drop: add it here" : "open the Logic panel first") : "drop on the Logic canvas";
    ghost.dataset.state = over ? (logicDrag.ondrop ? "ok" : "no") : "";
    document.documentElement.style.cursor = over ? (logicDrag.ondrop ? "copy" : "no-drop") : "grabbing";
  };
  const still = (e: TouchEvent) => { if (active) e.preventDefault(); };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (!active) {
      if (mouse && distance >= MOUSE_PX) begin();
      else if (!mouse && distance > HOLD_SLOP_PX) return end();
      else return;
    }
    draw(e.clientX, e.clientY);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const landed = active && e.type === "pointerup" && over;
    end();
    if (!landed) return;
    if (logicDrag.ondrop) logicDrag.ondrop(kind, { x: e.clientX, y: e.clientY });
    else logicDrag.refused = "Open the Logic panel to add a node there.";
  };
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
    ghost?.remove();
    ghost = null;
    document.documentElement.style.cursor = "";
    document.documentElement.classList.remove("library-dragging");
    if (active) logicDrag.kind = null;
    active = false;
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  if (!mouse) {
    window.addEventListener("touchmove", still, { passive: false });
    hold = window.setTimeout(() => {
      begin();
      draw(start.x, start.y);
    }, HOLD_MS);
  }
};
