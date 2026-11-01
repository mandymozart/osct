import { afterEach, describe, expect, it, vi } from "vitest";
import type { Group } from "three";
import type { EntityData, Target } from "../../types/index";
import { ArScene } from "../ar-scene";
import { observeEvents } from "../plugin-runtime";

const image: EntityData = { type: "image", assets: [{ id: "picture", assetType: "image", src: "/picture.jpg" }] };
const target: Target = { id: "page", entryId: "page", spreadId: "s", imageSrc: "/page.jpg", entity: image };
const bare: Target = { id: "bare", entryId: "bare", spreadId: "s", imageSrc: "/bare.jpg" };

interface Internals {
  buildAnchor(t: Target): { group: Group; entity: { object: Group; onTap?: () => void } | null };
  tapTarget(id: string): boolean;
  content: unknown;
  running: boolean;
  found: Set<string>;
}

/** A running scene with the anchors of `targets` – built like a spread switch does, without renderer or camera */
const runningScene = (...targets: Target[]) => {
  const scene = new ArScene(document.createElement("div"), { createTracker: () => { throw new Error("no tracker in this test"); } });
  const internals = scene as unknown as Internals;
  const anchors = targets.map(t => internals.buildAnchor(t));
  internals.content = { spreadId: "s", targets, anchors };
  internals.running = true;
  return { scene, internals, anchors };
};

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(off => off()));

describe("ArScene: a tap without aiming (the editor's tap button)", () => {
  it("takes the reader's path: the entity's onTap, the app's targetTapped and the plugins' core event", () => {
    const { scene, internals, anchors } = runningScene(target);
    const onTap = vi.fn();
    anchors[0].entity!.onTap = onTap;
    const tapped: string[] = [];
    const core: unknown[] = [];
    cleanups.push(scene.on("targetTapped", id => tapped.push(id)));
    cleanups.push(observeEvents((event, payload) => { if (event === "targetTapped") core.push(payload); }));
    internals.found.add("page");

    expect(internals.tapTarget("page")).toBe(true);
    expect(onTap).toHaveBeenCalledOnce();
    expect(tapped).toEqual(["page"]);
    expect(core).toEqual([{ targetId: "page" }]);
  });

  it("taps nothing while the target is not found, has no entity, or the scene does not run", () => {
    const { scene, internals, anchors } = runningScene(target, bare);
    const onTap = vi.fn();
    anchors[0].entity!.onTap = onTap;
    const tapped: string[] = [];
    cleanups.push(scene.on("targetTapped", id => tapped.push(id)));

    expect(internals.tapTarget("page")).toBe(false);
    internals.found.add("bare");
    expect(internals.tapTarget("bare")).toBe(false);
    expect(internals.tapTarget("nowhere")).toBe(false);
    internals.found.add("page");
    internals.running = false;
    expect(internals.tapTarget("page")).toBe(false);
    expect(onTap).not.toHaveBeenCalled();
    expect(tapped).toEqual([]);
  });
});
