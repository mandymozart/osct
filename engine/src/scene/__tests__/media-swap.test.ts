import { describe, expect, it, vi } from "vitest";
import { swapMediaSrc } from "../assets";

/** A media element whose time, pause state and play are under the test's hand (happy-dom does not decode) */
const element = (time: number, paused: boolean) => {
  const el = document.createElement("video");
  let current = time;
  Object.defineProperty(el, "currentTime", { get: () => current, set: (value: number) => (current = value), configurable: true });
  Object.defineProperty(el, "paused", { get: () => paused, configurable: true });
  Object.defineProperty(el, "duration", { get: () => 120, configurable: true });
  el.load = vi.fn();
  el.play = vi.fn(() => Promise.resolve());
  return el;
};

describe("a playing medium changes its level at the same spot (#331)", () => {
  it("takes the other file and goes on at the same time, playing if it played", () => {
    const el = element(42.5, false);
    swapMediaSrc(el, "https://cdn/v-480.mp4");
    expect(el.src).toBe("https://cdn/v-480.mp4");
    expect(el.load).toHaveBeenCalled();
    el.currentTime = 0; // the new file starts at 0 …
    el.dispatchEvent(new Event("loadedmetadata"));
    expect(el.currentTime).toBe(42.5); // … and is set back to where it was
    expect(el.play).toHaveBeenCalled();
  });

  it("a paused medium stays paused", () => {
    const el = element(10, true);
    swapMediaSrc(el, "a-64.mp3");
    el.dispatchEvent(new Event("loadedmetadata"));
    expect(el.currentTime).toBe(10);
    expect(el.play).not.toHaveBeenCalled();
  });
});
