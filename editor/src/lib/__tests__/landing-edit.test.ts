import { describe, expect, it } from "vitest";
import { LANDING_CONFIG } from "@ui/landing/landing-config";
import { appShopItems, appTextOf, canAddShopItem, landingEditProblem, shopPictureUrl, withLandingShop, withLandingText } from "../landing-edit";
import { heroOf, withoutLandingPick } from "../landing-pick";

const PICK = { scene: "s1", target: "dragon" };

describe("the landing's texts as edits (#365)", () => {
  it("sets a text of one language; blank takes it out – then the empty language, then texts", () => {
    const one = withLandingText(PICK, "de", "intro", "Hallo {title}");
    expect(one).toEqual({ ...PICK, texts: { de: { intro: "Hallo {title}" } } });
    const two = withLandingText(one, "en", "shop", "Buy");
    expect(two.texts).toEqual({ de: { intro: "Hallo {title}" }, en: { shop: "Buy" } });
    expect(withLandingText(withLandingText(two, "en", "shop", "  "), "de", "intro", "")).toEqual(PICK);
    // Without a pick: the texts alone
    expect(withLandingText(null, "fr", "getApp", "L'app")).toEqual({ texts: { fr: { getApp: "L'app" } } });
  });

  it("shows the app's text of the language in an empty field: title and author filled in, no markup", () => {
    const values = { title: "The Book", author: "A. Author" };
    expect(appTextOf("en", "intro", values)).toBe("The companion app to The Book by A. Author. Point your phone at the pages of the printed book to unlock videos, texts and references in augmented reality.");
    expect(appTextOf("de", "getApp", values)).toBe("Hol dir die App");
    expect(appTextOf("nl", "shop", values)).not.toBe(appTextOf("en", "shop", values));
  });
});

describe("the landing's shop as edits (#365)", () => {
  it("stores the list, [] as no shop; none again = the app's items", () => {
    expect(withLandingShop(PICK, [])).toEqual({ ...PICK, shop: [] });
    expect(withLandingShop({ ...PICK, shop: [] }, undefined)).toEqual(PICK);
  });

  it("copies the app's items with their English names, links and the book's cover (Edit)", () => {
    expect(appShopItems()).toEqual([
      { label: "The book", url: LANDING_CONFIG.shop[0].url, cover: true },
      { label: "The T-shirt", url: LANDING_CONFIG.shop[1].url, image: LANDING_CONFIG.shop[1].image },
    ]);
    expect(landingEditProblem({ shop: appShopItems() })).toBeNull();
  });

  it("takes up to four items, and holds a save while an item has no label or no http(s) link, or a text is too long", () => {
    const item = { label: "A", url: "https://shop/a" };
    expect(canAddShopItem([item, item, item])).toBe(true);
    expect(canAddShopItem([item, item, item, item])).toBe(false);
    expect(landingEditProblem({ shop: [{ label: "", url: "" }] })).toMatch(/shop\[0\]\.label/);
    expect(landingEditProblem({ shop: [{ label: "A", url: "shop.example" }] })).toMatch(/http\(s\)/);
    expect(landingEditProblem({ texts: { en: { getApp: "x".repeat(121) } } })).toMatch(/longer than 120/);
    expect(landingEditProblem({ ...PICK, shop: [item], texts: { de: { intro: "Hallo" } } })).toBeNull();
  });

  it("shows a picture's content path below the assets base; the app's pictures and URLs as they are", () => {
    expect(shopPictureUrl("/assets/content/landing/a.jpg", "https://cdn/x/")).toBe("https://cdn/x/assets/content/landing/a.jpg");
    expect(shopPictureUrl("/assets/ui/landing/t-shirt.svg", "https://cdn/x")).toBe("/assets/ui/landing/t-shirt.svg");
    expect(shopPictureUrl("https://up/a.jpg", "https://cdn/x")).toBe("https://up/a.jpg");
  });
});

describe("the pick apart from the texts and shop (#365)", () => {
  it("Remove keeps the texts and shop; nothing left is null", () => {
    expect(withoutLandingPick({ ...PICK, cover: "/c.jpg", texts: { en: { shop: "Buy" } } })).toEqual({ texts: { en: { shop: "Buy" } } });
    expect(withoutLandingPick({ ...PICK, cover: "/c.jpg" })).toBeNull();
    expect(heroOf({ ...PICK, cover: "/c.jpg", shop: [] })).toEqual({ ...PICK, cover: "/c.jpg" });
  });
});
