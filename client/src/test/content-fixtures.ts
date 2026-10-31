import type { Target } from "@/types";
import { getSpreads, getTargets } from "@/utils/game-config";

/**
 * A target with an AR video, for tests of app behaviour (unlock animation, taps on entities, video preload order).
 * The content's only entities are videos, and videos are not in git: a content build without them (CI, a
 * fresh clone) has no entity at all. Then the first target gets a video entity – in this test file's copy of the
 * game configuration only (vitest isolates modules per file); `restore()` takes it away again.
 */
export const targetWithVideo = (): { target: Target; restore: () => void } => {
  const targets = getSpreads().flatMap(spread => getTargets(spread.id));
  const existing = targets.find(target => target.entity?.assets.some(asset => asset.assetType === "video"));
  if (existing) return { target: existing, restore: () => {} };
  const target = targets[0];
  const before = target.entity;
  target.entity = {
    type: "video",
    assets: [{ id: `${target.id}-media`, assetType: "video", src: `/assets/content/entries/${target.entryId}/video.mp4` }],
  };
  return { target, restore: () => { target.entity = before; } };
};
