import { describe, expect, it } from "vitest";
import { IDLE, isMenuKey, LONG_PRESS_SLOP, nextMenuIndex, placeMenu, pressStep, typeaheadIndex, type PressEvent, type PressState } from "../context-menu";

/** Runs events from idle and returns the last state and every effect */
const run = (events: PressEvent[], from: PressState = IDLE) => {
  let state = from;
  const effects = events.map(event => {
    const next = pressStep(state, event);
    state = next.state;
    return next.effect;
  });
  return { state, effects };
};
const down = (x = 10, y = 10, pointerType = "touch"): PressEvent => ({ type: "down", pointerType, point: { x, y } });
const move = (x: number, y: number): PressEvent => ({ type: "move", point: { x, y } });

describe("the keyboard opens a context menu (#196)", () => {
  it("takes the menu key and Shift+F10, nothing else", () => {
    expect(isMenuKey({ key: "ContextMenu" })).toBe(true);
    expect(isMenuKey({ key: "F10", shiftKey: true })).toBe(true);
    expect(isMenuKey({ key: "F10" })).toBe(false);
    expect(isMenuKey({ key: "Enter", shiftKey: true })).toBe(false);
  });
});

describe("the menu stays on the screen", () => {
  const viewport = { width: 400, height: 800 };
  const menu = { width: 180, height: 120 };

  it("opens at the point where there is room", () => {
    expect(placeMenu({ x: 50, y: 60 }, menu, viewport)).toEqual({ x: 50, y: 60 });
  });

  it("flips to the point's left and above it near the right and bottom edges", () => {
    expect(placeMenu({ x: 350, y: 760 }, menu, viewport)).toEqual({ x: 170, y: 640 });
  });

  it("keeps a margin from every edge, also when the menu is nearly as wide as the screen", () => {
    expect(placeMenu({ x: 2, y: 3 }, menu, viewport)).toEqual({ x: 8, y: 8 });
    expect(placeMenu({ x: 100, y: 50 }, { width: 380, height: 120 }, viewport, 8)).toEqual({ x: 8, y: 50 });
  });
});

describe("the keys move through the menu (a WAI-ARIA menu)", () => {
  it("wraps the arrows around and jumps with Home and End", () => {
    expect(nextMenuIndex("ArrowDown", 0, 3)).toBe(1);
    expect(nextMenuIndex("ArrowDown", 2, 3)).toBe(0);
    expect(nextMenuIndex("ArrowUp", 0, 3)).toBe(2);
    expect(nextMenuIndex("Home", 2, 3)).toBe(0);
    expect(nextMenuIndex("End", 0, 3)).toBe(2);
  });

  it("starts at the first or the last item when none has the focus, and ignores other keys", () => {
    expect(nextMenuIndex("ArrowDown", -1, 3)).toBe(0);
    expect(nextMenuIndex("ArrowUp", -1, 3)).toBe(2);
    expect(nextMenuIndex("Enter", 0, 3)).toBeNull();
    expect(nextMenuIndex("ArrowDown", 0, 0)).toBeNull();
  });

  it("finds the next item by its first letter", () => {
    const labels = ["Open", "Add a double page after", "Remove"];
    expect(typeaheadIndex(labels, 0, "r")).toBe(2);
    expect(typeaheadIndex(labels, 2, "O")).toBe(0);
    expect(typeaheadIndex(labels, 0, "x")).toBeNull();
    expect(typeaheadIndex(labels, 0, "Shift")).toBeNull();
    expect(typeaheadIndex(labels, 0, " ")).toBeNull();
  });
});

describe("a long press opens the menu, a tap still opens the card (#196)", () => {
  it("opens the menu when the finger is held still until the timer runs out, and swallows the lift's click", () => {
    const { state, effects } = run([down(), move(12, 13), { type: "timeout" }, { type: "up" }, { type: "click" }]);
    expect(effects).toEqual(["start", null, "open", null, "swallow"]);
    expect(state).toEqual(IDLE);
  });

  it("opens where the finger is", () => {
    const { state } = run([down(10, 10), move(14, 12), { type: "timeout" }]);
    expect(state).toEqual({ phase: "fired", at: { x: 14, y: 12 } });
  });

  it("lets a tap through: lifted before the timer, the click opens the card", () => {
    const { effects } = run([down(), { type: "up" }, { type: "timeout" }, { type: "click" }]);
    expect(effects).toEqual(["start", "stop", null, null]);
  });

  it("gives way to a scroll: moving further than the slop cancels the press", () => {
    const { state, effects } = run([down(10, 10), move(10, 10 + LONG_PRESS_SLOP + 1), { type: "timeout" }, { type: "click" }]);
    expect(effects).toEqual(["start", "stop", null, null]);
    expect(state).toEqual(IDLE);
  });

  it("stops on pointercancel (the browser scrolls) and on a second finger", () => {
    expect(run([down(), { type: "cancel" }, { type: "timeout" }]).effects).toEqual(["start", "stop", null]);
    expect(run([down(), { type: "down", pointerType: "touch", point: { x: 50, y: 50 }, primary: false }, { type: "timeout" }]).effects).toEqual(["start", "stop", null]);
  });

  it("opens at once on the browser's own long press (Android's contextmenu) – once", () => {
    const { effects } = run([down(), { type: "contextmenu" }, { type: "timeout" }, { type: "contextmenu" }]);
    expect(effects).toEqual(["start", "open", null, null]);
  });

  it("never starts with a mouse – it has the right button", () => {
    const { state, effects } = run([down(10, 10, "mouse"), { type: "timeout" }, { type: "click" }]);
    expect(effects).toEqual([null, null, null]);
    expect(state).toEqual(IDLE);
  });

  it("works with a pen like with a finger", () => {
    expect(run([down(10, 10, "pen"), { type: "timeout" }]).effects).toEqual(["start", "open"]);
  });

  it("forgets a long press whose click never came, so the next click counts", () => {
    const fired = run([down(), { type: "timeout" }, { type: "up" }]).state;
    expect(fired.phase).toBe("fired");
    const { effects } = run([{ type: "cancel" }, { type: "click" }], fired);
    expect(effects).toEqual([null, null]);
  });
});
