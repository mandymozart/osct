import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntityData, Target } from "../../types/index";
import { ArScene } from "../ar-scene";
import { buildEntity } from "../entities";
import { isMediaHeld, releaseMedia } from "../media";
import type { LoadedAsset } from "../assets";

/** A video element that records play and pause */
const videoElement = (playing = false) => {
  const element = document.createElement("video");
  document.body.appendChild(element);
  let paused = !playing;
  Object.defineProperty(element, "paused", { get: () => paused });
  element.play = vi.fn(() => { paused = false; return Promise.resolve(); });
  element.pause = vi.fn(() => { paused = true; });
  return element;
};

const sceneWithMedia = (media: HTMLMediaElement[]) => {
  const scene = new ArScene(document.createElement("div"), { createTracker: () => { throw new Error("no tracker in this test"); } });
  (scene as unknown as { assets: { media(): HTMLMediaElement[] } }).assets.media = () => media;
  return scene;
};

const settle = () => new Promise(resolve => setTimeout(resolve));

afterEach(() => {
  releaseMedia();
  document.body.innerHTML = "";
});

describe("ArScene.holdClock: the editor's Live switch off (#275)", () => {
  it("stops the scene's playing videos where they are and lets them go on", async () => {
    const playing = videoElement(true);
    const waiting = videoElement(false);
    const scene = sceneWithMedia([playing, waiting]);
    scene.holdClock(true);
    expect(playing.paused).toBe(true);
    expect(isMediaHeld()).toBe(true);
    scene.holdClock(false);
    await settle();
    expect(playing.paused).toBe(false);
    expect(waiting.play).not.toHaveBeenCalled();
  });

  it("a video node found while held starts when the hold ends – not if its page went away meanwhile", async () => {
    const element = videoElement();
    const video: EntityData = { type: "video", assets: [{ id: "clip", assetType: "video", src: "/clip.mp4" }] };
    const target: Target = { id: "page", entryId: "page", sceneId: "s", imageSrc: "/page.jpg", entity: video };
    const loaded = { assetType: "video", element, texture: null } as unknown as LoadedAsset;
    const entity = buildEntity(target, () => loaded)!;
    const scene = sceneWithMedia([]);

    scene.holdClock(true);
    entity.onFound!();
    await settle();
    expect(element.play).not.toHaveBeenCalled();
    scene.holdClock(false);
    await settle();
    expect(element.paused).toBe(false);

    scene.holdClock(true);
    entity.onLost!();
    scene.holdClock(false);
    await settle();
    expect(element.play).toHaveBeenCalledTimes(1);
    expect(element.paused).toBe(true);
  });

  it("ends with the scene: the next scene's media are free", async () => {
    const scene = sceneWithMedia([videoElement(true)]);
    scene.holdClock(true);
    await scene.dispose();
    expect(isMediaHeld()).toBe(false);
  });
});
