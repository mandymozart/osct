import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { menuTrigger, type MenuSource } from "../menu-trigger";
import { LONG_PRESS_MS } from "../context-menu";

/** A link wired to its menu; `opened` records every opening, `cue` the press cue */
const setup = () => {
  const link = document.createElement("a");
  link.href = "#card";
  document.body.append(link);
  const opened: [number, number, MenuSource][] = [];
  const cue: boolean[] = [];
  const detach = menuTrigger({ open: (at, source) => opened.push([at.x, at.y, source]), pressing: on => cue.push(on) })(link);
  return { link, opened, cue, detach };
};
const pointer = (type: string, pointerType: string, x = 20, y = 30) =>
  new PointerEvent(type, { pointerType, clientX: x, clientY: y, isPrimary: true, bubbles: true, cancelable: true });
const click = () => new MouseEvent("click", { bubbles: true, cancelable: true });

describe("a card's menu trigger (#196)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("opens on the right button where the pointer is, without the browser's menu", () => {
    const { link, opened } = setup();
    const event = new MouseEvent("contextmenu", { clientX: 40, clientY: 50, bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(opened).toEqual([[40, 50, "mouse"]]);
  });

  it("opens after a held finger, with the cue while it is held, and keeps the lift's click from opening the card", () => {
    const { link, opened, cue } = setup();
    link.dispatchEvent(pointer("pointerdown", "touch"));
    expect(cue).toEqual([true]);
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(opened).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(opened).toEqual([[20, 30, "touch"]]);
    expect(cue).toEqual([true, false]);
    // Android's own long press after ours, while the finger is still down: no second menu
    link.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(opened).toHaveLength(1);
    link.dispatchEvent(pointer("pointerup", "touch"));
    const lift = click();
    link.dispatchEvent(lift);
    expect(lift.defaultPrevented).toBe(true);
  });

  it("lets a tap open the card", () => {
    const { link, opened } = setup();
    link.dispatchEvent(pointer("pointerdown", "touch"));
    vi.advanceTimersByTime(100);
    link.dispatchEvent(pointer("pointerup", "touch"));
    const tap = click();
    link.dispatchEvent(tap);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(tap.defaultPrevented).toBe(false);
    expect(opened).toEqual([]);
  });

  it("gives way to a scroll: a finger that moves is no press", () => {
    const { link, opened, cue } = setup();
    link.dispatchEvent(pointer("pointerdown", "touch", 20, 30));
    link.dispatchEvent(pointer("pointermove", "touch", 20, 60));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(opened).toEqual([]);
    expect(cue).toEqual([true, false]);
  });

  it("counts the next click again when the lift's click never came", () => {
    const { link } = setup();
    link.dispatchEvent(pointer("pointerdown", "touch"));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    link.dispatchEvent(pointer("pointerup", "touch"));
    vi.advanceTimersByTime(1000);
    const later = click();
    link.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it("opens from the keyboard (the menu key, Shift+F10) and ignores the contextmenu that follows the key", () => {
    const { link, opened } = setup();
    const key = new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true, cancelable: true });
    link.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    link.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    link.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }));
    link.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", bubbles: true, cancelable: true }));
    expect(opened.map(([, , source]) => source)).toEqual(["keyboard", "keyboard"]);
  });

  it("removes its listeners when detached", () => {
    const { link, opened, detach } = setup();
    detach();
    link.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(opened).toEqual([]);
  });
});
