import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "../api";

const listAssets = vi.fn();
vi.mock("../api", () => ({
  ApiError: class extends Error {},
  listAssets: (...args: unknown[]) => listAssets(...args),
  uploadAsset: vi.fn(),
  replaceAsset: vi.fn(),
  deleteAsset: vi.fn(),
}));

const asset = (id: string, kind: Asset["kind"], url: string, imported: boolean): Asset => ({
  id, name: url.split("/").pop() ?? url, kind, mime: "", size: 1, width: null, height: null, version: 1, url, usages: 0, imported, createdAt: "", updatedAt: "",
});

describe("the library with imported files", () => {
  beforeEach(() => listAssets.mockReset());

  it("lists the uploads and the imported files of a kind together, for the picker", async () => {
    listAssets.mockResolvedValue({ assets: [
      asset("a", "glb", "https://api/content/assets/osct/a/v1.glb", false),
      asset("import-1", "glb", "/assets/content/entries/racoon/racoon.glb", true),
      asset("import-2", "image", "/assets/content/entries/racoon/img.jpg", true),
    ] });
    const { library } = await import("../library.svelte");
    await library.load("osct");
    expect(library.ofKinds(["glb", "gltf"]).map(a => a.id)).toEqual(["a", "import-1"]);
    expect(library.ofKinds(["image"]).map(a => a.imported)).toEqual([true]);
    expect(library.byUrl("/assets/content/entries/racoon/img.jpg")?.name).toBe("img.jpg");
  });
});
