import { describe, expect, it, vi } from "vitest";
import { fitOf, isAnimated, pictureType, planWebp, toWebp, webpName, type WebpDeps } from "../browser-webp";

const bytes = (...parts: (string | number[])[]): Uint8Array =>
  new Uint8Array(parts.flatMap(p => (typeof p === "string" ? [...p].map(c => c.charCodeAt(0)) : p)));
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A fake browser: decodes every file to `width` × `height`, encodes to a blob of `type` */
function fake(width: number, height: number, type = "image/webp") {
  const close = vi.fn();
  const encode = vi.fn(async (_p: unknown, w: number, h: number, q: number) => new Blob([`${w}x${h}@${q}`], { type }));
  const deps: WebpDeps = { decode: vi.fn(async () => ({ width, height, close })), encode };
  return { deps, encode, close };
}

describe("the image rule in the browser (#298)", () => {
  it("knows the pictures it converts by type, else by extension", () => {
    expect(pictureType({ type: "image/jpeg", name: "a.bin" })).toBe("image/jpeg");
    expect(pictureType({ type: "", name: "Photo.PNG" })).toBe("image/png");
    expect(pictureType({ type: "application/octet-stream", name: "x.webp" })).toBe("image/webp");
    expect(pictureType({ type: "image/svg+xml", name: "logo.svg" })).toBe("");
    expect(pictureType({ type: "image/gif", name: "a.png" })).toBe("");
    expect(pictureType({ type: "model/gltf-binary", name: "a.glb" })).toBe("");
  });

  it("names the file .webp and reads the use's fit", () => {
    expect(webpName("Photo.JPG")).toBe("Photo.webp");
    expect(webpName("scan.v2.png")).toBe("scan.v2.webp");
    expect(webpName("noext")).toBe("noext.webp");
    expect(fitOf(undefined)).toBe("default");
    expect(fitOf("target")).toBe("target");
    expect(fitOf({ fit: "reference", surface: { scene: "s1", surface: "wall" } })).toBe("reference");
  });

  it("finds an animated PNG or WebP as the server does", () => {
    expect(isAnimated(bytes(PNG, "....IHDR....acTL....IDAT"))).toBe(true);
    expect(isAnimated(bytes(PNG, "....IHDR....IDAT....acTL"))).toBe(false);
    expect(isAnimated(bytes(PNG, "....IHDR....IDAT"))).toBe(false);
    expect(isAnimated(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8X", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "ANIM"))).toBe(true);
    expect(isAnimated(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe(false);
  });

  it("plans the size under the rule: down to the use's longest side, never up", () => {
    expect(planWebp("image/jpeg", 4000, 3000, "default")).toEqual({ keep: false, width: 2048, height: 1536 });
    expect(planWebp("image/jpeg", 3000, 4000, "target")).toEqual({ keep: false, width: 900, height: 1200 });
    expect(planWebp("image/png", 800, 600, "default")).toEqual({ keep: false, width: 800, height: 600 });
    expect(planWebp("image/webp", 800, 600, "default")).toEqual({ keep: true, reason: "within" });
    expect(planWebp("image/webp", 3000, 1000, "default")).toEqual({ keep: false, width: 2048, height: 683 });
    expect(planWebp("image/jpeg", 10_000, 6_000, "default")).toEqual({ keep: true, reason: "too-large" });
  });

  it("converts a JPEG to WebP at quality 82 within the fit", async () => {
    const { deps, encode, close } = fake(4000, 3000);
    const file = new File(["jpeg"], "Photo.jpg", { type: "image/jpeg" });
    const out = await toWebp(file, "target", deps);
    expect(out.converted).toBe(true);
    expect(out.file.name).toBe("Photo.webp");
    expect(out.file.type).toBe("image/webp");
    expect(encode).toHaveBeenCalledWith(expect.anything(), 1200, 900, 0.82);
    expect(close).toHaveBeenCalled();
  });

  it("keeps non-images, SVG, GIF, an animated PNG and a WebP within the size as they came", async () => {
    const { deps, encode } = fake(800, 600);
    for (const file of [
      new File(["glb"], "model.glb", { type: "model/gltf-binary" }),
      new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }),
      new File(["GIF89a"], "loop.gif", { type: "image/gif" }),
      new File([bytes(PNG, "....IHDR....acTL....IDAT") as BlobPart], "anim.png", { type: "image/png" }),
      new File(["webp"], "small.webp", { type: "image/webp" }),
    ]) {
      const out = await toWebp(file, "default", deps);
      expect(out).toEqual({ file, converted: false });
    }
    expect(encode).not.toHaveBeenCalled();
  });

  it("leaves the file to the server when the browser cannot decode or write WebP", async () => {
    const file = new File(["png"], "a.png", { type: "image/png" });
    const broken: WebpDeps = { decode: async () => { throw new Error("cannot decode"); }, encode: async () => null };
    expect(await toWebp(file, "default", broken)).toEqual({ file, converted: false });
    // a browser without a WebP encoder answers PNG
    expect(await toWebp(file, "default", fake(100, 100, "image/png").deps)).toEqual({ file, converted: false });
    expect(await toWebp(file, "default", { ...fake(100, 100).deps, encode: async () => null })).toEqual({ file, converted: false });
  });
});
