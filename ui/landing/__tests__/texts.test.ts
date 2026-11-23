import { describe, expect, it } from "vitest";
import en from "../locales/en/landing.json";
import { landingTexts } from "../texts";

describe("landingTexts", () => {
  it("fills title and author, escaped, in the language asked for", () => {
    expect(landingTexts("en", { title: "A & B", author: "<x>" }).intro).toContain("<em>A &amp; B</em> by &lt;x&gt;");
    expect(landingTexts("de", { title: "T", author: "A" }).getApp).toBe("Hol dir die App");
    expect(landingTexts("fr", { title: "T", author: "A" }).getApp).not.toBe(en.getApp);
  });
});
