import { describe, expect, it } from "vitest";
import { Group, MathUtils } from "three";
import { EntityData, Target } from "../../types/index";
import { ArScene } from "../ar-scene";

const image: EntityData = { type: "image", assets: [{ id: "picture", assetType: "image", src: "/picture.jpg" }] };
const target: Target = { id: "page", entryId: "page", spreadId: "s", imageSrc: "/page.jpg", entity: image };

/** A scene with one anchor for `target` – built like a spread switch does, without renderer or camera */
const sceneWithAnchor = () => {
  const scene = new ArScene(document.createElement("div"), { createTracker: () => { throw new Error("no tracker in this test"); } });
  const internals = scene as unknown as {
    buildAnchor(t: Target): { group: Group; entity: { object: Group } | null };
    content: unknown;
  };
  const anchor = internals.buildAnchor(target);
  internals.content = { spreadId: "s", targets: [target], anchors: [anchor] };
  return { scene, anchor };
};

describe("ArScene.overrideEntity (the editor's live edit)", () => {
  it("moves the entity in place for new placement values and restores the content's", () => {
    const { scene, anchor } = sceneWithAnchor();
    const placed = anchor.entity!.object;
    scene.overrideEntity("page", { ...image, params: { rotation: [0, 45, 0], scale: 2, position: [0, 0.1, 0] } });
    expect(anchor.entity!.object).toBe(placed);
    expect(placed.rotation.y).toBeCloseTo(MathUtils.degToRad(45));
    expect(placed.scale.toArray()).toEqual([2, 2, 2]);
    expect(placed.position.y).toBeCloseTo(0.1);

    scene.overrideEntity("page", null);
    expect(placed.rotation.y).toBe(0);
    expect(placed.scale.toArray()).toEqual([1, 1, 1]);
  });

  it("keeps the override for a rebuilt anchor (spread switched away and back)", () => {
    const { scene } = sceneWithAnchor();
    scene.overrideEntity("page", { ...image, params: { scale: 3 } });
    const rebuilt = (scene as unknown as { buildAnchor(t: Target): { entity: { object: Group } } }).buildAnchor(target);
    expect(rebuilt.entity.object.scale.x).toBe(3);
  });

  it("builds the entity anew when the type changes", () => {
    const { scene, anchor } = sceneWithAnchor();
    const before = anchor.entity!.object;
    scene.overrideEntity("page", { type: "video", assets: [{ id: "clip", assetType: "video", src: "/clip.mp4" }] });
    expect((anchor.entity as unknown as { type: string }).type).toBe("video");
    expect(anchor.entity!.object).not.toBe(before);
    expect(anchor.entity!.object.parent).toBe(anchor.group);
    expect(before.parent).toBeNull();
  });
});
