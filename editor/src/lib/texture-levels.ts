import { IMAGE_WEBP_QUALITY } from "@shared/api/images";
import { TEXTURE_SIZES, type TextureSetData, type TextureSize } from "@shared/types/textures";
import { browserDeps, type WebpDeps } from "./browser-webp";

/**
 * A map's smaller levels computed in the browser (#331 step 2 – Tilman: *"primaer im browser"*): from the largest map
 * there is, or from one file chosen for that, each smaller size of TEXTURE_SIZES is drawn on a canvas and written as
 * WebP (quality as the image rule), named `<base>-<size>.webp`. The Inspector's *textures* upload them and put them in the
 * set – that is where a model's links are made; the Library only shows them. Pictures only: video levels are made
 * beforehand (later perhaps on the production server), never encoded in the browser.
 */

/** The sizes below `source` a set still lacks, largest first (the order they are made in) */
export const levelsToMake = (source: TextureSize, have: readonly TextureSize[]): TextureSize[] =>
  TEXTURE_SIZES.filter(size => size < source && !have.includes(size)).reverse();

/** The largest size of a set that has a file */
export const largestOf = (set: TextureSetData | undefined): { size: TextureSize; src: string } | null =>
  set?.sizes.length ? [...set.sizes].sort((a, b) => b.size - a.size)[0] : null;

/** The sizes a set misses below its largest – what *compute the smaller levels* would make */
export const missingBelow = (set: TextureSetData | undefined): TextureSize[] => {
  const top = largestOf(set);
  return top ? levelsToMake(top.size, set!.sizes.map(entry => entry.size)) : [];
};

/** A level's file name: the source's name without its size and extension, then `-<size>.webp` (`body-4096.png` → `body-1024.webp`) */
export const levelName = (sourceName: string, size: TextureSize): string => {
  const base = sourceName.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, "").replace(/[-_.](512|1024|2048|4096)$/, "");
  return `${base || "map"}-${size}.webp`;
};

/** The size a picture is as a map: square and one of TEXTURE_SIZES – else why it is none */
export const mapSizeOf = (width: number, height: number): { size: TextureSize } | { problem: string } =>
  width === height && (TEXTURE_SIZES as readonly number[]).includes(width)
    ? { size: width as TextureSize }
    : { problem: `${width} × ${height} px – a map is square, 512, 1024, 2048 or 4096 px wide.` };

/**
 * The smaller levels of a map, as files: the picture decoded once, each size drawn and written as WebP. `onlevel` reports
 * each size as it starts. Throws when the picture cannot be read or is no map; a size the browser cannot write is left out.
 */
export async function makeLevels(
  source: Blob, sourceName: string, have: readonly TextureSize[], onlevel?: (size: TextureSize) => void, deps: WebpDeps = browserDeps,
): Promise<{ size: TextureSize; sizes: { size: TextureSize; file: File }[] }> {
  const picture = await deps.decode(source as File);
  try {
    const map = mapSizeOf(picture.width, picture.height);
    if ("problem" in map) throw new Error(`${sourceName}: ${map.problem}`);
    const files: { size: TextureSize; file: File }[] = [];
    for (const size of levelsToMake(map.size, have)) {
      onlevel?.(size);
      const blob = await deps.encode(picture, size, size, IMAGE_WEBP_QUALITY / 100);
      if (!blob || blob.type !== "image/webp") continue;
      files.push({ size, file: new File([blob], levelName(sourceName, size), { type: "image/webp" }) });
    }
    return { size: map.size, sizes: files };
  } finally {
    picture.close();
  }
}
