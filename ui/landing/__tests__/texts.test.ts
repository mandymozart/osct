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

describe("an experience's own texts (#365)", () => {
  const values = { title: "A & B", author: "<x>" };
  const own = { de: { intro: "Zu {title} von {{author}}.\nZweite Zeile <b>", shop: "Laden" }, en: { getApp: "Install" } };

  it("take the app's place field by field, in the visitor's language only", () => {
    const de = landingTexts("de", values, own);
    expect(de.intro).toBe("Zu A &amp; B von &lt;x&gt;.<br />Zweite Zeile &lt;b&gt;");
    expect(de.shop).toBe("Laden");
    // Left out: the app's text in that language
    expect(de.getApp).toBe("Hol dir die App");
    expect(de.openOnPhone).toBe(landingTexts("de", values).openOnPhone);
    // Another language's own text never shows
    const fr = landingTexts("fr", values, own);
    expect(fr).toEqual(landingTexts("fr", values));
    expect(landingTexts("en", values, own).getApp).toBe("Install");
  });

  it("never reach the texts that stay the app's – the QR code's alt text, Scan, Privacy & terms", () => {
    const sneaky = { en: { qrAlt: "x", scan: "y", privacy: "z" } } as unknown as Parameters<typeof landingTexts>[2];
    expect(landingTexts("en", values, sneaky)).toEqual(landingTexts("en", values));
  });

  it("blank stays the app's; a line break outside the intro is a space", () => {
    expect(landingTexts("en", values, { en: { intro: "   ", openOnPhone: "One\ntwo" } })).toMatchObject({
      intro: landingTexts("en", values).intro, openOnPhone: "One two",
    });
  });
});
