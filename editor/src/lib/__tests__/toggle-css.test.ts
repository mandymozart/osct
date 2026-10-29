import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Read from disk: vitest hands CSS imports over empty, and happy-dom gives import.meta.url an http URL
const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");

/** The rules of app.css as [selector, body], in source order */
const rules = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => [m[1].trim(), m[2]] as const);

describe("app.css: a framed toggle", () => {
  it("shows pressed when it is on – the last background for .pill.framed.on is the pressed one (#99)", () => {
    // Rules that reach a `.pill.framed.on` button with equal or higher specificity, the last one wins
    const matches = rules(css).filter(([selector, body]) =>
      /background\s*:/.test(body) && selector.split(",").some(s => [".pill.on", ".pill.framed", ".pill.framed.on"].includes(s.trim())));
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.at(-1)![1]).toContain("var(--pressed-background)");
  });
});
