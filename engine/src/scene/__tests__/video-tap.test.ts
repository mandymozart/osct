import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntityData, Target } from "../../types/index";
import { buildEntity } from "../entities";
import { endTap, releaseMedia, restoreSound } from "../media";
import type { LoadedAsset } from "../assets";

/** A video element that records play and pause and keeps its time; `refuse` = the browser blocks unmuted playback */
const videoElement = ({ refuse = false } = {}) => {
  const element = document.createElement("video");
  document.body.appendChild(element);
  let paused = true;
  Object.defineProperty(element, "paused", { get: () => paused });
  element.play = vi.fn(() => {
    if (refuse && !element.muted) return Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
    paused = false;
    return Promise.resolve();
  });
  element.pause = vi.fn(() => { paused = true; });
  return element;
};

const videoEntity = (element: HTMLVideoElement, children: EntityData[] = []) => {
  const video: EntityData = { type: "video", assets: [{ id: "clip", assetType: "video", src: "/clip.mp4" }], children };
  const target: Target = { id: "page", entryId: "page", sceneId: "s", imageSrc: "/page.jpg", entity: video };
  const loaded = { assetType: "video", element, texture: null } as unknown as LoadedAsset;
  return buildEntity(target, () => loaded)!;
};

const settle = () => new Promise(resolve => setTimeout(resolve));

afterEach(() => {
  releaseMedia();
  document.body.innerHTML = "";
});

describe("a video node and the reader's tap (#290)", () => {
  it("found it plays; a tap pauses it, the next plays it again – the tap is the video's", async () => {
    const element = videoElement();
    const entity = videoEntity(element);
    entity.onFound!();
    await settle();
    expect(element.paused).toBe(false);

    expect(entity.onTap!()).toBe(true);
    expect(element.paused).toBe(true);
    expect(entity.onTap!()).toBe(true);
    await settle();
    expect(element.paused).toBe(false);
  });

  it("lost it stops where it is; found again it goes on from there", async () => {
    const element = videoElement();
    const entity = videoEntity(element);
    entity.onFound!();
    await settle();
    element.currentTime = 12;
    entity.onLost!();
    expect(element.paused).toBe(true);
    entity.onFound!();
    await settle();
    expect(element.paused).toBe(false);
    expect(element.currentTime).toBe(12);
  });

  it("silenced by the browser, the first tap gives it its sound and it plays on", async () => {
    const element = videoElement({ refuse: true });
    const entity = videoEntity(element);
    entity.onFound!();
    await settle();
    expect(element.muted).toBe(true);
    expect(element.paused).toBe(false);

    // The scene's tap: sound back first, then the entity hears the tap
    restoreSound();
    expect(entity.onTap!()).toBe(true);
    endTap();
    expect(element.muted).toBe(false);
    expect(element.paused).toBe(false);
    // The next tap pauses it
    restoreSound();
    entity.onTap!();
    endTap();
    expect(element.paused).toBe(true);
  });

  it("a node without a video under it does not use the tap", () => {
    const image: EntityData = { type: "image", assets: [{ id: "picture", assetType: "image", src: "/picture.jpg" }] };
    const target: Target = { id: "page", entryId: "page", sceneId: "s", imageSrc: "/page.jpg", entity: image };
    const entity = buildEntity(target, () => undefined);
    expect(entity?.onTap?.() ?? false).toBe(false);
  });
});
