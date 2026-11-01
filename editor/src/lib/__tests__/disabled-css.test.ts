import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Read from disk: vitest hands CSS imports over empty, and happy-dom gives import.meta.url an http URL
const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");

/** The rules of app.css as [selectors, body], in source order */
const rules = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => [m[1].split(",").map(s => s.trim()), m[2]] as const);

/** The last value of a property among the rules naming the selector */
const last = (selector: string, property: string) =>
  rules(css).filter(([selectors, body]) => selectors.includes(selector) && new RegExp(`(^|;|\\s)${property}\\s*:`).test(body))
    .map(([, body]) => body.match(new RegExp(`${property}\\s*:\\s*([^;]+)`))![1].trim()).at(-1);

describe("app.css: a disabled control looks disabled (#166)", () => {
  it.each([".pill:disabled", ".icon-button:disabled", ".field:disabled", ".text-link:disabled", "select:disabled"])("%s is dimmed with a not-allowed cursor", selector => {
    expect(last(selector, "cursor")).toBe("not-allowed");
    expect(Number(last(selector, "opacity"))).toBeLessThan(0.6);
  });

  it("a disabled select shows no dropdown arrow", () => {
    expect(last("select:disabled", "appearance")).toBe("none");
  });
});
