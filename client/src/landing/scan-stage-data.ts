import type { AssetData, EntityData, Scene, Target } from "@engine/types/content";

/**
 * What the landing's scan stage shows (#354): one scene of the book lying open, the target with a 3D model on it, and
 * the model itself – picked from the loaded content, so the stage needs nothing of its own. Units: the surface's width
 * is 1, its centre the origin, x → right, y → the top of the page (as the engine's placement, `shared/types/placement.ts`).
 */
export interface ScanStageData {
  /** The surface's height in surface widths (a 460 × 320 mm spread: 0.696) */
  aspect: number;
  /** The printed page numbers the surface shows, read from its label or its scene's (`10–11` → [10, 11]) – its layout sheet */
  pages: number[];
  /** The printed images on the paper: the scene's targets where they lie (`place`) */
  prints: ScanPrint[];
  /** The target that holds the model */
  target: ScanPrint;
  /** The model's node and its file */
  entity: EntityData;
  asset: AssetData;
}

export interface ScanPrint {
  src: string;
  /** Its centre across, in surface widths */
  x: number;
  /** Its top edge, up from the surface's centre; `null` = centred (a target without `place`) */
  top: number | null;
  width: number;
  /** In surface widths; none = from the image's proportions */
  height?: number;
}

/** A surface for scenes without one that knows its size: a double page of the book (mm) */
const FALLBACK_SURFACE = { widthMm: 460, heightMm: 320 };
/** A target without `place` (made outside the editor): in the middle of the paper, this wide */
const UNPLACED_WIDTH = 0.6;

const isModel = (entity: EntityData | undefined): entity is EntityData =>
  !!entity && entity.type === "model" && entity.assets.some(asset => asset.assetType === "glb" || asset.assetType === "gltf");

/** A target's print on its scene's surface – unplaced: in the middle */
const printOf = (target: Target, scene: Scene): ScanPrint | null => {
  const surface = scene.surfaces.find(s => s.id === target.place?.surface) ?? scene.surfaces[0] ?? FALLBACK_SURFACE;
  const place = target.place;
  if (!place) return { src: target.imageSrc, x: 0, top: null, width: UNPLACED_WIDTH };
  const unit = surface.widthMm;
  return {
    src: target.imageSrc,
    x: (place.x + place.width / 2) / unit - 0.5,
    top: surface.heightMm / unit / 2 - place.y / unit,   // mm down from the top edge → up from the centre
    width: place.width / unit,
    height: place.height !== undefined ? place.height / unit : undefined,
  };
};

/**
 * The scene and model of the stage: the entry `entryId` (the book's 10/11 – `LANDING_CONFIG.scanEntry`) when it holds a
 * model, else the first target with a model (the test fixture offline). With placed targets the whole spread lies
 * there; without (the fixture), only the model's target. `null`: the content has no model at all.
 */
export const scanStageData = (scenes: readonly Scene[], entryIds: readonly string[]): ScanStageData | null => {
  const targets = scenes.flatMap(scene => scene.targets.map(target => ({ scene, target })));
  const chosen = entryIds.map(id => targets.find(({ target }) => target.entryId === id || target.id === id))
    .find(found => found && isModel(found.target.entity))
    ?? targets.find(({ target }) => isModel(target.entity));
  if (!chosen || !isModel(chosen.target.entity)) return null;
  const { scene, target } = chosen;
  const entity = chosen.target.entity;
  const asset = entity.assets.find(a => a.assetType === "glb" || a.assetType === "gltf")!;
  const surface = scene.surfaces.find(s => s.id === target.place?.surface) ?? scene.surfaces[0] ?? FALLBACK_SURFACE;
  const own = printOf(target, scene)!;
  const placed = target.place
    ? scene.targets.filter(t => t.place && (t.place.surface ?? scene.surfaces[0]?.id) === (target.place!.surface ?? scene.surfaces[0]?.id))
      .map(t => printOf(t, scene)!)
    : [own];
  const label = ("label" in surface && surface.label) || scene.label || "";
  const pages = (label.match(/\d+/g) ?? []).map(Number);
  return { aspect: surface.heightMm / surface.widthMm, pages, prints: placed, target: own, entity, asset };
};
