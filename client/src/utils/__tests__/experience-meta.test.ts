import { beforeEach, describe, expect, it } from "vitest";
import { applyExperienceMeta, experienceManifestUrl } from "../experience-meta";

// The page follows the experience the address names (#343); the build's default keeps what index.html says
describe("the page's title, description and manifest", () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <meta name="description" content="Onion Skin" />
      <meta name="apple-mobile-web-app-title" content="Onion Skin &amp; Crocodile Tears" />
      <link rel="manifest" href="/manifest.webmanifest" />`;
    document.title = "Onion Skin and Crocodile Tears - Kevin Bray (buildingfictions)";
  });
  const manifest = () => document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute("href");

  it("another experience: its title, a description from it, and its own manifest", () => {
    expect(applyExperienceMeta(document, { experience: "demo", fallback: "osct", title: "Demo", author: "Ana" }, "/api")).toBe(true);
    expect(document.title).toBe("Demo – Ana");
    expect(document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toBe("Augmented reality companion to Ana's book Demo.");
    expect(document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')?.content).toBe("Demo");
    expect(manifest()).toBe("/api/experiences/demo/manifest.webmanifest");
  });

  it("the build's default experience keeps the build's title and manifest", () => {
    expect(applyExperienceMeta(document, { experience: "osct", fallback: "osct", title: "Other" }, "/api")).toBe(false);
    expect(document.title).toBe("Onion Skin and Crocodile Tears - Kevin Bray (buildingfictions)");
    expect(manifest()).toBe("/manifest.webmanifest");
  });

  it("the manifest URL of an experience", () => {
    expect(experienceManifestUrl("demo", "/api")).toBe("/api/experiences/demo/manifest.webmanifest");
  });
});
