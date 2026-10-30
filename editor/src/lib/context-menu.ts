/**
 * A context menu's logic, apart from the DOM (`components/ContextMenu.svelte` and `menu-trigger.ts` use it): which key
 * opens one, where it goes on the screen, how the keys move through it (a WAI-ARIA menu), and the long press that opens
 * it with a finger. Disabled items stay focusable – they say why they are disabled – but do nothing when chosen.
 */

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}

/** The keyboard's way to a context menu: the menu key, or Shift+F10 */
export const isMenuKey = (event: { key: string; shiftKey?: boolean }): boolean =>
  event.key === "ContextMenu" || (event.key === "F10" && !!event.shiftKey);

/**
 * Where the menu's top left corner goes: at the point, flipped to the point's left / above it when it would run off
 * the viewport there, and never closer to an edge than `margin`
 */
export const placeMenu = (at: Point, menu: Size, viewport: Size, margin = 8): Point => {
  const axis = (p: number, size: number, room: number) => {
    let start = p + size > room - margin ? p - size : p;
    start = Math.min(start, room - margin - size);
    return Math.max(margin, start);
  };
  return { x: axis(at.x, menu.width, viewport.width), y: axis(at.y, menu.height, viewport.height) };
};

/** The item a key moves the focus to (arrows wrap around, Home / End), or null when the key does not move it */
export const nextMenuIndex = (key: string, current: number, count: number): number | null => {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown": return current < 0 ? 0 : (current + 1) % count;
    case "ArrowUp": return current < 0 ? count - 1 : (current - 1 + count) % count;
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
};

/** Type-ahead: the next item after `current` whose label starts with the typed character, or null */
export const typeaheadIndex = (labels: readonly string[], current: number, char: string): number | null => {
  if (char.length !== 1 || !char.trim()) return null;
  const wanted = char.toLocaleLowerCase();
  for (let step = 1; step <= labels.length; step++) {
    const i = (current + step + labels.length) % labels.length;
    if (labels[i].trim().toLocaleLowerCase().startsWith(wanted)) return i;
  }
  return null;
};

// ── the long press: a finger held still on an element opens its menu, a tap still opens the element ──

/** How long a finger is held still before the menu opens */
export const LONG_PRESS_MS = 500;
/** How far (CSS px) a finger may move and still be a press – further is a scroll */
export const LONG_PRESS_SLOP = 8;

export type PressState =
  | { phase: "idle" }
  | { phase: "pressing"; start: Point; at: Point }
  /** The menu opened: the click that follows the finger's lift must not open the element */
  | { phase: "fired"; at: Point };

export type PressEvent =
  | { type: "down"; pointerType: string; point: Point; primary?: boolean }
  | { type: "move"; point: Point }
  /** The press timer ran out */
  | { type: "timeout" }
  /** The browser's own long-press signal (`contextmenu` during a touch, as Android sends it) */
  | { type: "contextmenu" }
  | { type: "up" }
  /** `pointercancel` (the browser took the gesture for a scroll), or the lift's click did not come in time */
  | { type: "cancel" }
  /** A click on the element */
  | { type: "click" };

/** What the trigger does after a step: start or stop the timer and the cue, open the menu, swallow the click */
export type PressEffect = "start" | "stop" | "open" | "swallow" | null;

export const IDLE: PressState = { phase: "idle" };

const far = (a: Point, b: Point, slop: number) => Math.hypot(a.x - b.x, a.y - b.y) > slop;

/** One step of the long press. A mouse never starts one – it has the right button; nor does a second finger. */
export const pressStep = (state: PressState, event: PressEvent, slop = LONG_PRESS_SLOP): { state: PressState; effect: PressEffect } => {
  switch (event.type) {
    case "down":
      if (event.pointerType === "mouse" || event.primary === false) return { state: IDLE, effect: state.phase === "pressing" ? "stop" : null };
      return { state: { phase: "pressing", start: event.point, at: event.point }, effect: "start" };
    case "move":
      if (state.phase !== "pressing") return { state, effect: null };
      return far(state.start, event.point, slop) ? { state: IDLE, effect: "stop" } : { state: { ...state, at: event.point }, effect: null };
    case "timeout":
    case "contextmenu":
      return state.phase === "pressing" ? { state: { phase: "fired", at: state.at }, effect: "open" } : { state, effect: null };
    case "up":
      return state.phase === "pressing" ? { state: IDLE, effect: "stop" } : { state, effect: null };
    case "cancel":
      return { state: IDLE, effect: state.phase === "pressing" ? "stop" : null };
    case "click":
      return state.phase === "fired" ? { state: IDLE, effect: "swallow" } : { state, effect: null };
  }
};
