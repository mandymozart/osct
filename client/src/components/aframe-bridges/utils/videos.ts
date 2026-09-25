import { getTarget } from "@/utils/game-config";

/**
 * AR videos (PLAN Phase 3, design p.37–40): play when their target is found, pause when it is lost
 * or the scene pauses (consultation, overlays). No "zoom out" hint – MindAR only reports a target
 * once it is fully in view.
 */

/** `<video>` asset elements of a target's entity in the scene */
const getTargetVideos = (scene: Element, targetId: string): HTMLVideoElement[] =>
  (getTarget(targetId)?.entity?.assets ?? [])
    .filter(asset => asset.assetType === "video")
    .map(asset => scene.querySelector(`#${CSS.escape(asset.id)}`))
    .filter((el): el is HTMLVideoElement => el instanceof HTMLVideoElement);

/**
 * Play with sound; if the browser blocks unmuted autoplay (no user gesture yet, e.g. iOS), play
 * muted instead of not at all. Device check: PLAN Phase 7.
 */
const play = async (video: HTMLVideoElement): Promise<void> => {
  try {
    await video.play();
  } catch (error) {
    if ((error as DOMException)?.name !== "NotAllowedError") {
      console.warn("[Videos] Could not play video:", error);
      return;
    }
    video.muted = true;
    await video.play().catch(e => console.warn("[Videos] Could not play muted video:", e));
  }
};

export const playTargetVideos = (scene: Element, targetId: string): void => {
  getTargetVideos(scene, targetId).forEach(video => void play(video));
};

export const pauseTargetVideos = (scene: Element, targetId: string): void => {
  getTargetVideos(scene, targetId).forEach(video => video.pause());
};

export const pauseAllVideos = (scene: Element): void => {
  scene.querySelectorAll("video").forEach(video => {
    // MindAR's camera feed is a <video> outside the scene's assets; only pause asset videos
    if (video.closest("a-assets")) video.pause();
  });
};
