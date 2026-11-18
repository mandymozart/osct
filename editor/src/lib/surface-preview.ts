import { CONTENT_PATH } from "@engine/content/game-config";
import type { SurfaceData, TargetPlace } from "@shared/types/game-config";
import type { SurfaceReference } from "@shared/api/editor";
import { surfaceOfPlace } from "./surface-edit";

/**
 * Pictures of a scene outside the stage (#153, #319): the books page's covers and the Scenes panel's cards. A scene is
 * drawn as its surfaces side by side (their order, each at its own size), each with its reference image (#314, fitted
 * as it says) and the prints of the targets lying on it (`TargetPlace`, the same the stage reads – a print moved in the
 * editor shows at once). A surface without a reference is paper.
 */

/** A content path (`/assets/content/…`) under the book's assets base; any other URL as it is */
export const assetUrl = (assetsBase: string | null | undefined, src: string): string => {
  const root = (assetsBase ?? "").replace(/\/+$/, "");
  return root && src.startsWith(CONTENT_PATH) ? `${root}${src}` : src;
};

/** A print over a surface's picture: percent of the surface's width / height; the height follows the image, as on the stage */
export interface PrintBox {
  id: string;
  src: string;
  left: number;
  top: number;
  width: number;
}

/** A target as the preview reads it: its image and its place */
export interface PreviewTarget {
  id: string;
  imageSrc: string;
  place?: TargetPlace | null;
}

/** One surface of a scene's picture: its share of the width, its height against the tallest, its reference and prints */
export interface PreviewPart {
  id: string;
  /** Its width against the scene's surfaces side by side (0…1) */
  share: number;
  /** Its height against the tallest surface (0…1) */
  height: number;
  label: string;
  reference: { url: string; fit: SurfaceReference["fit"] } | null;
  prints: PrintBox[];
}

/** The prints of the targets lying on `surface` (`surfaceOfPlace`), in percent of the surface; targets without a place are left out */
export const printBoxes = (
  targets: readonly PreviewTarget[],
  surface: Pick<SurfaceData, "id" | "widthMm" | "heightMm">,
  surfaces: readonly Pick<SurfaceData, "id">[],
  assetsBase?: string | null,
): PrintBox[] =>
  targets.flatMap(target => {
    const place = target.place;
    if (!place || !target.imageSrc || !(place.width > 0) || surfaceOfPlace(place, surfaces)?.id !== surface.id) return [];
    return [{
      id: target.id,
      src: assetUrl(assetsBase, target.imageSrc),
      left: (place.x / surface.widthMm) * 100,
      top: (place.y / surface.heightMm) * 100,
      width: (place.width / surface.widthMm) * 100,
    }];
  });

/**
 * A scene's picture: its surfaces side by side, each with its reference image (by surface id) and its prints – and the
 * whole's width : height. Null for a scene without surfaces.
 */
export const previewParts = (
  surfaces: readonly SurfaceData[] | undefined,
  references: Readonly<Record<string, SurfaceReference>> = {},
  targets: readonly PreviewTarget[] = [],
  assetsBase?: string | null,
): { parts: PreviewPart[]; ratio: number } | null => {
  const usable = (surfaces ?? []).filter(s => s.widthMm > 0 && s.heightMm > 0);
  if (!usable.length) return null;
  const width = usable.reduce((sum, s) => sum + s.widthMm, 0);
  const tallest = Math.max(...usable.map(s => s.heightMm));
  return {
    ratio: width / tallest,
    parts: usable.map(s => {
      const reference = references[s.id];
      return {
        id: s.id,
        share: s.widthMm / width,
        height: s.heightMm / tallest,
        label: s.label ?? "",
        reference: reference ? { url: assetUrl(assetsBase, reference.url), fit: reference.fit } : null,
        prints: printBoxes(targets, s, usable, assetsBase),
      };
    }),
  };
};
