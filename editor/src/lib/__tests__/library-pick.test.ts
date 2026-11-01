import { describe, expect, it } from "vitest";
import { acceptOf, isTargetImage, matchesFilter, pickAccept, pickFilter, pickFits, pickKinds, targetImagesOf, type PickSubject } from "../library-pick";
import type { Asset } from "../api";

const asset = (kind: Asset["kind"], url: string, name = url.split("/").pop() ?? url) => ({ kind, url, name });

const printed = asset("image", "https://cdn.example/assets/osct/a1/v1.jpg", "Target Image.jpg");
const imported = asset("image", "/assets/content/entries/p015-1/target.jpg");
const picture = asset("image", "/assets/content/entries/p015-1/image.jpg");
const upload = asset("image", "https://cdn.example/assets/osct/b2/v1.png", "Dot.png");
const video = asset("video", "/assets/content/entries/p015-1/video.mp4");
const glb = asset("glb", "https://cdn.example/assets/osct/c3/v1.glb", "racoon.glb");
const gltf = asset("gltf", "/assets/content/world/scene.gltf");
const sound = asset("audio", "https://cdn.example/assets/osct/d4/v1.mp3", "hum.mp3");
const targets = targetImagesOf([{ targets: [{ imageSrc: printed.url }, { imageSrc: "" }] }, { targets: [] }]);

// #164: the Library as the picker – target images apart from images, a filter per field, only what fits is picked
describe("target images", () => {
  it("are images a target uses, or the import's target of an entry", () => {
    expect([...targets]).toEqual([printed.url]);
    expect(isTargetImage(printed, targets)).toBe(true);
    expect(isTargetImage(imported, targets)).toBe(true);
    expect(isTargetImage(picture, targets)).toBe(false);
    expect(isTargetImage(upload, targets)).toBe(false);
    expect(isTargetImage(asset("video", "/assets/content/entries/p015-1/target.mp4"), targets)).toBe(false);
  });
});

describe("the library's filters", () => {
  const all = [printed, imported, picture, upload, video, glb, gltf, sound];
  const shown = (filter: Parameters<typeof matchesFilter>[1]) => all.filter(a => matchesFilter(a, filter, targets));

  it("tell target images from the other images", () => {
    expect(shown("target")).toEqual([printed, imported]);
    expect(shown("image")).toEqual([picture, upload]);
  });

  it("show a model as glb or gltf, and everything under all", () => {
    expect(shown("model")).toEqual([glb, gltf]);
    expect(shown("video")).toEqual([video]);
    expect(shown("audio")).toEqual([sound]);
    expect(shown("all")).toEqual(all);
  });
});

describe("a pick", () => {
  const targetImage: PickSubject = { for: "target-image" };
  const model: PickSubject = { for: "node", nodeType: "model" };
  const videoNode: PickSubject = { for: "node", nodeType: "video" };
  const imageNode: PickSubject = { for: "node", nodeType: "image" };

  it("starts at the filter of the kind it picks", () => {
    expect(pickFilter(targetImage)).toBe("target");
    expect(pickFilter(model)).toBe("model");
    expect(pickFilter(videoNode)).toBe("video");
    expect(pickFilter(imageNode)).toBe("image");
    expect(pickFilter({ for: "node", nodeType: "group" })).toBe("all");
    expect(pickFilter({ for: "environment", slot: "world" })).toBe("model");
    expect(pickFilter({ for: "environment", slot: "sky" })).toBe("image");
  });

  it("takes only what fits its field: a video node never a picture, a target image never a video", () => {
    expect(pickFits(videoNode, video)).toBe(true);
    expect(pickFits(videoNode, printed)).toBe(false);
    expect(pickFits(targetImage, printed)).toBe(true);
    expect(pickFits(targetImage, picture)).toBe(true);
    expect(pickFits(targetImage, video)).toBe(false);
    expect(pickFits(imageNode, printed)).toBe(true);
    expect(pickKinds({ for: "node", nodeType: "text" })).toEqual([]);
  });

  it("takes a glb or a gltf for a model node (#165)", () => {
    expect(pickFits(model, glb)).toBe(true);
    expect(pickFits(model, gltf)).toBe(true);
    expect(pickFits(model, video)).toBe(false);
    expect(pickAccept(model)).toBe(".glb,model/gltf-binary,.gltf,model/gltf+json");
  });

  it("checks the environment's files by their extension", () => {
    expect(pickFits({ for: "environment", slot: "world" }, glb)).toBe(true);
    expect(pickFits({ for: "environment", slot: "sky" }, upload)).toBe(true);
    expect(pickFits({ for: "environment", slot: "sky" }, glb)).toBe(false);
  });

  it("uploads only its kinds", () => {
    expect(pickAccept(targetImage)).toBe(".jpg,.jpeg,.png,.webp");
    expect(pickAccept(videoNode)).toBe(".mp4,.webm,.mov");
    expect(acceptOf(["image", "audio"])).toBe(".jpg,.jpeg,.png,.webp,.mp3,.m4a,.ogg,.wav");
  });
});
