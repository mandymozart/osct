import { fitImage, IMAGE_MAX_PIXELS, IMAGE_WEBP_QUALITY, type ImageFit, type ImageUse } from "@shared/api/images";

/**
 * The image rule in the browser (#298, follow-up to phase 1 – like SCUTOONS' media standard): a picture is turned into
 * WebP before it is uploaded, so a server without GD (the shared FTPS host of staging) still gets WebP. The server keeps
 * its own conversion (server/api/src/Images.php) as the fallback for the MCP server, scripts and browsers that cannot
 * encode WebP; a file converted here is a WebP within the size and passes the server unchanged.
 *
 * - JPEG / PNG / WebP only; SVG, GIF, an animated PNG or WebP and every other file stay as they are;
 * - the EXIF orientation applied (`imageOrientation: "from-image"`), the longest side at most `IMAGE_MAX_SIDE[fit]`,
 *   never scaled up;
 * - WebP at `IMAGE_WEBP_QUALITY` with its transparency – lossy: a canvas cannot write lossless WebP (the server writes a
 *   transparent picture lossless; here it is lossy with alpha);
 * - a WebP already within the size keeps its bytes (no second lossy pass);
 * - a picture above `IMAGE_MAX_PIXELS`, one the browser cannot decode, or a browser that cannot encode WebP: the file
 *   goes as it came, and the server converts it or answers (413 for the pixels).
 */

/** The formats the rule converts (as the server: jpg, png, webp) */
const CONVERTS: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** The picture type of a file – its MIME type, else the one its extension says ("" for anything else) */
export function pictureType(file: Pick<File, "type" | "name">): string {
  const type = file.type.toLowerCase();
  if (Object.values(CONVERTS).includes(type)) return type;
  if (type && type !== "application/octet-stream") return "";
  return CONVERTS[file.name.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase() ?? ""] ?? "";
}

/** The fit of an upload's use (`default` when none is named) */
export const fitOf = (use: ImageFit | ImageUse | undefined): ImageFit => (typeof use === "string" ? use : use?.fit ?? "default");

/** `Photo.JPG` → `Photo.webp`; a name without extension gets `.webp` */
export const webpName = (name: string): string => `${name.replace(/\.[a-z0-9]+$/i, "")}.webp`;

const ascii = (bytes: Uint8Array, from: number, length: number): string => String.fromCharCode(...bytes.subarray(from, from + length));

/** The first index of `tag` (4 ASCII letters) in the bytes, -1 when none */
function find(bytes: Uint8Array, tag: string): number {
  const codes = [...tag].map(c => c.charCodeAt(0));
  outer: for (let i = 0; i + codes.length <= bytes.length; i++) {
    for (let j = 0; j < codes.length; j++) if (bytes[i + j] !== codes[j]) continue outer;
    return i;
  }
  return -1;
}

/**
 * An animated PNG (`acTL` before the image data) or WebP (an `ANIM` chunk) – as the server reads it: a canvas would keep
 * only the first frame. `bytes`: the file's head (the first 64 kB is plenty).
 */
export function isAnimated(bytes: Uint8Array): boolean {
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") {
    const actl = find(bytes, "acTL");
    const idat = find(bytes, "IDAT");
    return actl !== -1 && (idat === -1 || actl < idat);
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return find(bytes.subarray(12, 76), "ANIM") !== -1;
  return false;
}

/** What the browser does with a decoded picture: keep the file, or write it at `width` × `height` */
export type WebpPlan = { keep: true; reason: "too-large" | "within" } | { keep: false; width: number; height: number };

/** The plan for a decoded picture of `width` × `height` (upright) and type `type` under the rule for `fit` */
export function planWebp(type: string, width: number, height: number, fit: ImageFit): WebpPlan {
  if (width * height > IMAGE_MAX_PIXELS) return { keep: true, reason: "too-large" };
  const size = fitImage(width, height, fit);
  if (type === "image/webp" && size.width === width && size.height === height) return { keep: true, reason: "within" };
  return { keep: false, ...size };
}

/** The browser's result: the file to upload, and – when it was converted here – the file as it came */
export interface BrowserWebp {
  file: File;
  converted: boolean;
}

/** What the conversion needs from the browser – swapped in tests */
export interface WebpDeps {
  decode: (file: File) => Promise<Decoded>;
  encode: (picture: Decoded, width: number, height: number, quality: number) => Promise<Blob | null>;
}

/** A decoded picture (an `ImageBitmap` in the browser) */
export interface Decoded {
  width: number;
  height: number;
  close(): void;
}

const browserDeps: WebpDeps = {
  decode: file => createImageBitmap(file, { imageOrientation: "from-image" }),
  encode: async (picture, width, height, quality) => {
    const bitmap = picture as ImageBitmap;
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      return canvas.convertToBlob({ type: "image/webp", quality });
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
  },
};

/**
 * The file an upload sends for the use's `fit`: a JPEG / PNG / WebP as WebP under the image rule, everything else – and
 * anything the browser cannot decode or encode – as it came (see above). Never throws.
 */
export async function toWebp(file: File, fit: ImageFit = "default", deps: WebpDeps = browserDeps): Promise<BrowserWebp> {
  const unchanged = { file, converted: false };
  const type = pictureType(file);
  if (!type) return unchanged;
  try {
    if (type !== "image/jpeg" && isAnimated(new Uint8Array(await file.slice(0, 65536).arrayBuffer()))) return unchanged;
    const bitmap = await deps.decode(file);
    try {
      const plan = planWebp(type, bitmap.width, bitmap.height, fit);
      if (plan.keep) return unchanged;
      const blob = await deps.encode(bitmap, plan.width, plan.height, IMAGE_WEBP_QUALITY / 100);
      // a browser that cannot write WebP answers PNG (or nothing): the server converts
      if (!blob || blob.type !== "image/webp") return unchanged;
      return { file: new File([blob], webpName(file.name), { type: "image/webp", lastModified: file.lastModified }), converted: true };
    } finally {
      bitmap.close();
    }
  } catch {
    return unchanged;
  }
}
