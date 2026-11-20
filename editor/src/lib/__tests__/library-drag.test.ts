import { describe, expect, it } from "vitest";
import type { AssetKind } from "@shared/api/rules";
import { NAME_MAX, cleanAssetName, dropFit, dropRowOf, nameStem, storedExtension, type DropRow } from "../library-drag";

const file = (kind: AssetKind, name = `file.${kind}`) => ({ kind, name });
const node = (nodeType: string, path: number[] = [0]): DropRow => ({ kind: "node", targetId: "p015-1", path, nodeType });
const target: DropRow = { kind: "target", targetId: "p015-1" };
/** The built-in node types' file kinds (`nodeAssetTypes`) plus a plugin's type that declares a model */
const KINDS: Record<string, readonly AssetKind[]> = { model: ["glb", "gltf"], image: ["image"], video: ["video"], wobbler: ["glb"] };
const kindsOf = (type: string) => KINDS[type];

describe("a Library tile dropped on a tree row (#330): file kind × row kind", () => {
  const cases: [AssetKind, DropRow, boolean][] = [
    ["glb", node("model"), true], ["gltf", node("model"), true], ["image", node("model"), false], ["video", node("model"), false],
    ["image", node("image"), true], ["glb", node("image"), false], ["video", node("image"), false],
    ["video", node("video"), true], ["image", node("video"), false], ["audio", node("video"), false],
    ["glb", node("wobbler"), true], ["image", node("wobbler"), false],
    ["glb", node("group"), false], ["image", node("light"), false],
    ["shader", node("model"), false], ["subtitles", node("video"), false],
    ["image", target, true], ["glb", target, false], ["video", target, false], ["audio", target, false],
  ];
  it.each(cases)("%s on %o fits: %s", (kind, row, ok) => {
    expect(dropFit(file(kind), row, kindsOf)?.ok).toBe(ok);
  });

  it("says what a drop does, or why it does nothing", () => {
    expect(dropFit(file("glb", "castle.glb"), node("model"), kindsOf)).toEqual({ ok: true, action: "node", text: "The model node takes castle.glb" });
    expect(dropFit(file("image", "page.webp"), target, kindsOf)).toEqual({ ok: true, action: "target", text: "page.webp becomes the printed image of p015-1" });
    expect(dropFit(file("image"), node("model"), kindsOf)).toEqual({ ok: false, text: "A model node takes a 3D model – not a picture" });
    expect(dropFit(file("glb"), node("group"), kindsOf)).toEqual({ ok: false, text: "A group node takes no file" });
    expect(dropFit(file("audio"), target, kindsOf)).toEqual({ ok: false, text: "A target's printed image is a picture – not a sound" });
    expect(dropFit(file("audio"), node("image"), kindsOf)?.text).toBe("An image node takes a picture – not a sound");
  });

  it("over no row there is nothing to say", () => {
    expect(dropFit(file("glb"), null, kindsOf)).toBeNull();
  });

  it("reads the row's drop data as the tree writes it", () => {
    expect(dropRowOf({ drop: "node", target: "p015-1", path: "0.2", nodeType: "model" })).toEqual({ kind: "node", targetId: "p015-1", path: [0, 2], nodeType: "model" });
    expect(dropRowOf({ drop: "node", target: "p015-1", path: "", nodeType: "group" })).toEqual({ kind: "node", targetId: "p015-1", path: [], nodeType: "group" });
    expect(dropRowOf({ drop: "target", target: "p015-1" })).toEqual(target);
    expect(dropRowOf({ drop: "node", target: "p015-1" })).toBeNull();
    expect(dropRowOf({ drop: "target" })).toBeNull();
    expect(dropRowOf({})).toBeNull();
  });
});

describe("a name given by hand (#330, the API's AssetNames::cleanName)", () => {
  it("keeps the stored file's extension – added when missing, kept as typed in any case", () => {
    expect(cleanAssetName("castle", "glb")).toEqual({ name: "castle.glb" });
    expect(cleanAssetName("castle.glb", "glb")).toEqual({ name: "castle.glb" });
    expect(cleanAssetName("Castle.GLB", "glb")).toEqual({ name: "Castle.GLB" });
    expect(cleanAssetName("photo.png", "webp")).toEqual({ name: "photo.png.webp" });
    expect(cleanAssetName("notes", "")).toEqual({ name: "notes" });
  });

  it("folds white space and trims trailing dots", () => {
    expect(cleanAssetName("  Desk \t  photo ", "webp")).toEqual({ name: "Desk photo.webp" });
    expect(cleanAssetName("desk.", "webp")).toEqual({ name: "desk.webp" });
  });

  it("refuses an empty name, a path and control characters", () => {
    for (const bad of ["", "   ", ".", "..", ".webp", "a/b", "a\\b", "a\u0001b", "a\u007fb"]) {
      expect("problem" in cleanAssetName(bad, "webp"), JSON.stringify(bad)).toBe(true);
    }
  });

  it("refuses a name longer than the API keeps", () => {
    expect("problem" in cleanAssetName("x".repeat(NAME_MAX), "webp")).toBe(true);
    expect(cleanAssetName("x".repeat(NAME_MAX - 5), "webp")).toEqual({ name: `${"x".repeat(NAME_MAX - 5)}.webp` });
  });

  it("edits the part before the stored extension – the URL's, else the name's", () => {
    expect(storedExtension({ url: "https://cdn.example/assets/osct/a1/v2.webp?x=1", name: "Photo.jpg" })).toBe("webp");
    expect(storedExtension({ url: "/assets/content/entries/p015-1/target.JPG", name: "target" })).toBe("jpg");
    expect(storedExtension({ url: "https://cdn.example/blob", name: "Photo.PNG" })).toBe("png");
    expect(nameStem("Desk photo.webp", "webp")).toBe("Desk photo");
    expect(nameStem("Desk photo.WEBP", "webp")).toBe("Desk photo");
    expect(nameStem("Desk photo", "webp")).toBe("Desk photo");
  });
});
