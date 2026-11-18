import { describe, expect, it } from "vitest";
import { assetUrl, previewParts, printBoxes } from "../surface-preview";

/** #153, #319: a scene as a picture – its surfaces side by side, each with its reference image and the prints on it */

const FLAT = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
const spread = { id: "surface", widthMm: 460, heightMm: 320, label: "4–5", place: FLAT };
const wall = { id: "wall", widthMm: 2000, heightMm: 1500, place: { ...FLAT, rx: 90 } };

describe("the scene's picture", () => {
  it("draws the surfaces side by side: each its share of the width and its height against the tallest", () => {
    const picture = previewParts([spread, wall])!;
    expect(picture.ratio).toBeCloseTo(2460 / 1500, 6);
    expect(picture.parts.map(p => [p.id, +p.share.toFixed(3), +p.height.toFixed(3), p.label])).toEqual([["surface", 0.187, 0.213, "4–5"], ["wall", 0.813, 1, ""]]);
    expect(previewParts([])).toBeNull();
    expect(previewParts(undefined)).toBeNull();
  });

  it("lays each surface's reference image (a content path under the assets base) and its fit", () => {
    const picture = previewParts([spread], { surface: { url: "/assets/content/scenes/s4/ref.webp", name: "ref.webp", fit: "contain" } }, [], "https://cdn.test/demo/")!;
    expect(picture.parts[0].reference).toEqual({ url: "https://cdn.test/demo/assets/content/scenes/s4/ref.webp", fit: "contain" });
    expect(assetUrl("", "https://x.test/a.jpg")).toBe("https://x.test/a.jpg");
  });

  it("puts each target's print on the surface it lies on, in percent of that surface; no place, no print", () => {
    const targets = [
      { id: "a", imageSrc: "/a.jpg", place: { x: 46, y: 32, width: 92 } },
      { id: "b", imageSrc: "/b.jpg", place: { surface: "wall", x: 1000, y: 0, width: 200 } },
      { id: "c", imageSrc: "/c.jpg" },
    ];
    expect(printBoxes(targets, spread, [spread, wall])).toEqual([{ id: "a", src: "/a.jpg", left: 10, top: 10, width: 20 }]);
    expect(printBoxes(targets, wall, [spread, wall])).toEqual([{ id: "b", src: "/b.jpg", left: 50, top: 0, width: 10 }]);
  });
});
