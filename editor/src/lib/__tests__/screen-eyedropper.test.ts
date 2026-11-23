import { describe, expect, it } from "vitest";
import { screenEyedropper } from "#lib/colour.js";

/** The colour fields' eyedropper picks anywhere on the screen where the browser has an EyeDropper (#338) */
describe("screenEyedropper", () => {
  const scopeAnswering = (answer: () => Promise<{ sRGBHex: string }>) => ({
    EyeDropper: class { open() { return answer(); } },
  });

  it("is missing where the browser has no EyeDropper (the stage picker is the fallback)", () => {
    expect(screenEyedropper({})).toBeNull();
  });

  it("answers the picked pixel as a long lower-case hex", async () => {
    expect(await screenEyedropper(scopeAnswering(async () => ({ sRGBHex: "#FFAA00" })))!()).toBe("#ffaa00");
    expect(await screenEyedropper(scopeAnswering(async () => ({ sRGBHex: "#fa0" })))!()).toBe("#ffaa00");
  });

  it("reads an rgb() answer", async () => {
    expect(await screenEyedropper(scopeAnswering(async () => ({ sRGBHex: "rgb(255, 170, 0)" })))!()).toBe("#ffaa00");
  });

  it("answers null when the pick is cancelled", async () => {
    expect(await screenEyedropper(scopeAnswering(() => Promise.reject(new DOMException("aborted", "AbortError"))))!()).toBeNull();
  });
});
