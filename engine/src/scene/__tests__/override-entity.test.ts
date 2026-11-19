import { describe, expect, it } from "vitest";
import { type Group, MathUtils } from "three";
import type { EntityData, Target } from "../../types/index";
import { ArScene } from "../ar-scene";

const image: EntityData = { type: "image", assets: [{ id: "picture", assetType: "image", src: "/picture.jpg" }] };
const target: Target = { id: "page", entryId: "page", sceneId: "s", imageSrc: "/page.jpg", entity: image };

/** A scene with one anchor for `target` – built like a scene switch does, without renderer or camera */
const sceneWithAnchor = () => {
  const scene = new ArScene(document.createElement("div"), { createTracker: () => { throw new Error("no tracker in this test"); } });
  const internals = scene as unknown as {
    buildAnchor(t: Target): { group: Group; entity: { object: Group } | null };
    content: unknown;
  };
  const anchor = internals.buildAnchor(target);
  internals.content = { sceneId: "s", targets: [target], anchors: [anchor] };
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

  it("keeps the override for a rebuilt anchor (scene switched away and back)", () => {
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

describe("ArScene.overrideAppearance (the editor's live edit of the book's looks, #265)", () => {
  const lookOf = (scene: ArScene, moment: "reveal" | "found" | "lost", on: Target = target) =>
    (scene as unknown as { momentLook(m: string, t: Target): { type: string } }).momentLook(moment, on);

  it("plays the editor's looks instead of the book's until restored; a moment without one takes found's", () => {
    const { scene } = sceneWithAnchor();
    scene.overrideAppearance({ appearance: { found: { type: "printLift" }, lost: { type: "fade" } } });
    expect(lookOf(scene, "reveal").type).toBe("printLift");
    expect(lookOf(scene, "lost").type).toBe("fade");
    // None named: the default everywhere, whatever the book says
    scene.overrideAppearance({ appearance: null });
    expect(lookOf(scene, "found").type).toBe("inflateDissolve");
    // Restored: the book's (this test's content has no book – the default)
    scene.overrideAppearance(null);
    expect(lookOf(scene, "lost").type).toBe("inflateDissolve");
  });

  it("an entity's own looks (its root node's components) win over the book's and the editor's override (#268)", () => {
    const { scene } = sceneWithAnchor();
    scene.overrideAppearance({ appearance: { found: { type: "printLift" }, reveal: { type: "fade" } } });
    const own: Target = { ...target, entity: { ...image, components: [{ type: "reveal", look: "inflateDissolve" }, { type: "lost", look: "fade" }] } };
    expect(lookOf(scene, "reveal", own).type).toBe("inflateDissolve");
    expect(lookOf(scene, "lost", own).type).toBe("fade");
    // no found of its own, no look named for it: the editor's override plays
    expect(lookOf(scene, "found", own).type).toBe("printLift");
    expect(lookOf(scene, "reveal").type).toBe("fade");
    // the editor's own edit of the entity (overrideEntity) is what plays
    scene.overrideEntity("page", { ...image, components: [{ type: "found", look: "fade", duration: 900 }] });
    expect(lookOf(scene, "found")).toEqual({ type: "fade", duration: 900 });
    expect(lookOf(scene, "reveal")).toEqual({ type: "fade", duration: 900 });
  });
});
