import { IDLE, isMenuKey, LONG_PRESS_MS, pressStep, type PressEffect, type Point, type PressEvent, type PressState } from "./context-menu.js";

/** How the menu was asked for */
export type MenuSource = "mouse" | "touch" | "keyboard";

export interface MenuTriggerOptions {
  /** Open the menu at a point of the viewport */
  open: (at: Point, source: MenuSource) => void;
  /** The long press began (true) or ended (false) – the light cue while the finger is held */
  pressing?: (on: boolean) => void;
}

/** After the lift, how long the click of a long press may take before a click counts again */
const LIFT_CLICK_MS = 600;

/**
 * Wires an element to its context menu (an attachment: `{@attach menuTrigger({ … })}`): the right button, a long press
 * with a finger (`LONG_PRESS_MS`, cancelled by moving – a scroll – or lifting early), the menu key or Shift+F10 while it
 * is focused. The click after a long press is swallowed, so a tap still opens the element and a long press does not.
 * The browser's own menu (and Android's link preview) never shows; text selection and the iOS callout are the
 * element's CSS (`user-select`, `-webkit-touch-callout`). The logic is `pressStep` (`context-menu.ts`).
 */
export const menuTrigger = (options: MenuTriggerOptions) => (node: HTMLElement) => {
  let state: PressState = IDLE;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The menu key also sends a `contextmenu`: the menu is open already */
  let keyboardAt = -Infinity;

  const stopTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const step = (event: PressEvent): PressEffect => {
    const next = pressStep(state, event);
    state = next.state;
    if (next.effect === "start") {
      stopTimer();
      timer = setTimeout(() => step({ type: "timeout" }), LONG_PRESS_MS);
      options.pressing?.(true);
    } else if (next.effect === "stop") {
      stopTimer();
      options.pressing?.(false);
    } else if (next.effect === "open" && state.phase === "fired") {
      stopTimer();
      options.pressing?.(false);
      options.open(state.at, "touch");
    }
    return next.effect;
  };

  const point = (e: { clientX: number; clientY: number }): Point => ({ x: e.clientX, y: e.clientY });
  const onDown = (e: PointerEvent) => void step({ type: "down", pointerType: e.pointerType, point: point(e), primary: e.isPrimary });
  const onMove = (e: PointerEvent) => void step({ type: "move", point: point(e) });
  const onUp = () => {
    step({ type: "up" });
    // A browser that sends no click after a long press must not swallow the next one
    if (state.phase === "fired") timer = setTimeout(() => step({ type: "cancel" }), LIFT_CLICK_MS);
  };
  const onCancel = () => void step({ type: "cancel" });
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (state.phase === "pressing") return void step({ type: "contextmenu" });
    if (state.phase === "fired" || performance.now() - keyboardAt < 1000) return;
    options.open(point(e), "mouse");
  };
  const onClick = (e: MouseEvent) => {
    if (step({ type: "click" }) !== "swallow") return;
    stopTimer();
    e.preventDefault();
    e.stopPropagation();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!isMenuKey(e)) return;
    e.preventDefault();
    keyboardAt = performance.now();
    const rect = node.getBoundingClientRect();
    options.open({ x: rect.left + Math.min(16, rect.width / 2), y: rect.top + Math.min(16, rect.height / 2) }, "keyboard");
  };
  // A held finger drags a link in some browsers: the press is the menu's
  const onDrag = (e: DragEvent) => {
    if (state.phase !== "idle") e.preventDefault();
  };

  const listeners: [string, EventListener, boolean?][] = [
    ["pointerdown", onDown as EventListener],
    ["pointermove", onMove as EventListener],
    ["pointerup", onUp],
    ["pointercancel", onCancel],
    ["contextmenu", onContextMenu as EventListener],
    ["click", onClick as EventListener, true],
    ["keydown", onKey as EventListener],
    ["dragstart", onDrag as EventListener],
  ];
  for (const [type, listener, capture] of listeners) node.addEventListener(type, listener, capture);
  return () => {
    stopTimer();
    for (const [type, listener, capture] of listeners) node.removeEventListener(type, listener, capture);
  };
};
