import { IMAGE_WEBP_QUALITY } from "@shared/api/images";
import { MEDIA_LEVELS, MEDIA_LEVEL_UNIT, type LevelledKind, type MediaLevelData } from "@shared/types/media-levels";
import type { EntityData } from "@engine/types";
import type { Asset } from "./api";
import { browserDeps, type WebpDeps } from "./browser-webp";

/**
 * A picture's, video's or sound's quality levels in the Inspector (#331 step 3, content schema 4.3): the node's file names
 * the same medium at several levels – an image by its longest side, a video by its height, a sound by its bitrate
 * (`MEDIA_LEVELS`) – and the reader's media quality chooses. The Inspector makes the links; the Library only shows them.
 *
 * - **Images**: a level is read from the picture (its longest side, the nearest level), and the smaller levels can be
 *   **computed in the browser** from the largest one – WebP as the image rule, like a model's maps (`texture-levels.ts`).
 * - **Videos**: levels are made beforehand and uploaded into their slot (the file's shorter side tells the level when it
 *   is known) – never encoded in the browser (Tilman: video levels are made before, later perhaps on the production server).
 * - **Sounds**: uploaded into their slot (a file does not tell its bitrate here).
 */

/** A level's label: `1024 px`, `720p`, `128 kbps` */
export const levelLabel = (kind: LevelledKind, level: number): string =>
  kind === "video" ? `${level}p` : `${level} ${MEDIA_LEVEL_UNIT[kind]}`;

/**
 * The level a Library file stands for, or why it has none: an image by its longest side, a video by its shorter side –
 * the nearest level (a 1920 px picture is the 2048 level, a 1080 × 1920 film the 1080p one); a sound tells nothing here.
 */
export const levelOfAsset = (asset: Pick<Asset, "kind" | "name" | "width" | "height">, kind: LevelledKind): { level: number } | { problem: string } => {
  if (asset.kind !== kind) return { problem: `${asset.name} is no ${kind === "audio" ? "sound" : kind}.` };
  if (kind === "audio") return { problem: `${asset.name}: choose the level it is for (a sound does not tell its bitrate).` };
  if (asset.width === null || asset.height === null) return { problem: `${asset.name}: the file does not tell its size – choose the level it is for.` };
  const side = kind === "image" ? Math.max(asset.width, asset.height) : Math.min(asset.width, asset.height);
  const levels: readonly number[] = MEDIA_LEVELS[kind];
  return { level: levels.reduce((best, level) => (Math.abs(level - side) < Math.abs(best - side) ? level : best), levels[0]) };
};

/** The levels with this file at `level` (replacing the one there), smallest first */
export const withLevel = (levels: readonly MediaLevelData[] | undefined, level: number, src: string): MediaLevelData[] =>
  [...(levels ?? []).filter(entry => entry.level !== level), { level, src }].sort((a, b) => a.level - b.level);

/** The levels without `level`; none left = `undefined` (the medium is one level again) */
export const withoutLevel = (levels: readonly MediaLevelData[] | undefined, level: number): MediaLevelData[] | undefined => {
  const next = (levels ?? []).filter(entry => entry.level !== level);
  return next.length ? next : undefined;
};

/** The node with these levels on its file (none = its own file only) */
export const setNodeLevels = (node: EntityData, levels: MediaLevelData[] | undefined): EntityData => ({
  ...node,
  assets: node.assets.map((asset, i) => {
    if (i !== 0) return asset;
    const { levels: _, ...rest } = asset;
    return levels?.length ? { ...rest, levels } : rest;
  }),
});

/** The image levels below a picture's longest side that are not there yet, largest first (the order they are made in) */
export const imageLevelsToMake = (longest: number, have: readonly number[]): number[] =>
  MEDIA_LEVELS.image.filter(level => level < longest && !have.includes(level)).reverse();

/** A level's file name: the source's name without its level and extension, then `-<level>.webp` (`sky-2048.png` → `sky-512.webp`) */
export const imageLevelName = (sourceName: string, level: number): string => {
  const base = sourceName.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, "").replace(/[-_.](512|1024|2048)$/, "");
  return `${base || "image"}-${level}.webp`;
};

/**
 * The smaller levels of a picture, as files: decoded once, each level drawn with that longest side (the aspect kept) and
 * written as WebP. `onlevel` reports each level as it starts. Throws when the picture cannot be read; a level the browser
 * cannot write is left out. `level`: the level the source itself stands for (its longest side, the nearest level).
 */
export async function makeImageLevels(
  source: Blob, sourceName: string, have: readonly number[], onlevel?: (level: number) => void, deps: WebpDeps = browserDeps,
): Promise<{ level: number; levels: { level: number; file: File }[] }> {
  const picture = await deps.decode(source as File);
  try {
    const longest = Math.max(picture.width, picture.height);
    const own = levelOfAsset({ kind: "image", name: sourceName, width: picture.width, height: picture.height }, "image");
    const ownLevel = "level" in own ? own.level : MEDIA_LEVELS.image[MEDIA_LEVELS.image.length - 1];
    const files: { level: number; file: File }[] = [];
    // Below the level the source stands for (a 1100 px picture is the 1024 level: only 512 is made)
    for (const level of imageLevelsToMake(ownLevel, have)) {
      onlevel?.(level);
      const scale = level / longest;
      const blob = await deps.encode(picture, Math.max(1, Math.round(picture.width * scale)), Math.max(1, Math.round(picture.height * scale)), IMAGE_WEBP_QUALITY / 100);
      if (!blob || blob.type !== "image/webp") continue;
      files.push({ level, file: new File([blob], imageLevelName(sourceName, level), { type: "image/webp" }) });
    }
    return { level: ownLevel, levels: files };
  } finally {
    picture.close();
  }
}
