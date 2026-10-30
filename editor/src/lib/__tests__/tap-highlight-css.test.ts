import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Read from disk: vitest hands CSS imports over empty
const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The bodies of the rules whose selector list is exactly `selector` */
const bodies = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].trim() === selector).map(m => m[2]);

describe("app.css: no browser tap highlight, the editor's own pressed state (#201)", () => {
  it("turns the tap highlight off for the whole editor (inherited by every control)", () => {
    expect(bodies(":root").some(body => /-webkit-tap-highlight-color:\s*transparent/.test(body))).toBe(true);
  });

  it("a pressed pill or icon button shows the hover background, a pressed text link the text colour – not on a toggle that is on", () => {
    expect(bodies(".pill:active:not(:disabled):not(.on), .icon-button:active:not(:disabled):not(.on)").join("")).toMatch(/background:\s*var\(--hover-background\)/);
    expect(bodies(".text-link:active:not(:disabled)").join("")).toMatch(/color:\s*var\(--text\)/);
  });
});
