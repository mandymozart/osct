import type { Asset } from "./api";
import { fitsSlot, type EnvironmentSlot } from "./environment.svelte";
import { assetPlace } from "./library-place";

export type AssetKind = Asset["kind"];

/** The file extensions of each kind (the API's `Assets::KINDS`) */
export const KIND_EXTENSIONS: Record<AssetKind, readonly string[]> = {
  glb: [".glb"], gltf: [".gltf"], video: [".mp4", ".webm", ".mov"], image: [".jpg", ".jpeg", ".png", ".webp"], audio: [".mp3", ".m4a", ".ogg", ".wav"],
};
/** The media types of a model next to its extension: a browser that knows no `.glb` may still know the type */
const KIND_MIMES: Partial<Record<AssetKind, readonly string[]>> = { glb: ["model/gltf-binary"], gltf: ["model/gltf+json"] };

/** A file input's `accept` for these kinds */
export const acceptOf = (kinds: readonly AssetKind[]): string =>
  kinds.flatMap(kind => [...KIND_EXTENSIONS[kind], ...(KIND_MIMES[kind] ?? [])]).join(",");

/** The file kinds a node type takes */
export const NODE_ASSET_KINDS: Record<string, readonly AssetKind[]> = { model: ["glb", "gltf"], video: ["video"], image: ["image"] };

/**
 * The Library's filters (#164): target images – the pictures printed in the book – apart from the other images, so a
 * choice is among one kind.
 */
export const LIBRARY_FILTERS = ["all", "target", "image", "video", "model", "audio"] as const;
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];
export const FILTER_LABELS: Partial<Record<LibraryFilter, string>> = { target: "target image" };
const FILTER_KINDS: Record<Exclude<LibraryFilter, "all" | "target">, readonly AssetKind[]> = {
  image: ["image"], video: ["video"], model: ["glb", "gltf"], audio: ["audio"],
};

type AssetRef = Pick<Asset, "kind" | "name" | "url">;

/** A printed target's image: one a target of the draft uses, or the import's `target.*` of an entry */
export const isTargetImage = (asset: AssetRef, targetImages: ReadonlySet<string>): boolean =>
  asset.kind === "image" && (targetImages.has(asset.url) || assetPlace(asset).role === "target");

/** The asset passes the filter (`image` = the images that are no target image) */
export const matchesFilter = (asset: AssetRef, filter: LibraryFilter, targetImages: ReadonlySet<string>): boolean => {
  if (filter === "all") return true;
  if (filter === "target") return isTargetImage(asset, targetImages);
  if (filter === "image") return asset.kind === "image" && !isTargetImage(asset, targetImages);
  return FILTER_KINDS[filter].includes(asset.kind);
};

/** What the Library picks a file for: a target's printed image, a node's file, the environment's world or sky */
export type PickSubject =
  | { for: "target-image" }
  | { for: "node"; nodeType: string }
  | { for: "environment"; slot: EnvironmentSlot };

/**
 * The Library opened as a picker: what it picks for (the filter it starts with and the files that fit), a line for
 * its head (`the printed image of p015-1`), the file chosen now; a pick hands the file to `onpick` – only to the one
 * field it was opened for – and `oncancel` returns without one.
 */
export interface LibraryPick {
  subject: PickSubject;
  label: string;
  current?: string;
  onpick: (asset: Asset) => void | Promise<void>;
  oncancel: () => void;
}

/** The kinds that fit the subject */
export const pickKinds = (subject: PickSubject): readonly AssetKind[] =>
  subject.for === "target-image" ? ["image"]
    : subject.for === "node" ? NODE_ASSET_KINDS[subject.nodeType] ?? []
      : subject.slot === "world" ? ["glb", "gltf"] : ["image"];

/** The filter the picker starts with */
export const pickFilter = (subject: PickSubject): LibraryFilter => {
  if (subject.for === "target-image") return "target";
  if (subject.for === "environment") return subject.slot === "world" ? "model" : "image";
  return subject.nodeType === "model" ? "model" : subject.nodeType === "video" ? "video" : subject.nodeType === "image" ? "image" : "all";
};

/** The asset fits the subject (the environment's files also by their extension) */
export const pickFits = (subject: PickSubject, asset: Pick<Asset, "kind" | "url">): boolean =>
  subject.for === "environment" ? fitsSlot(asset, subject.slot) : pickKinds(subject).includes(asset.kind);

/** The upload's `accept` while picking for the subject */
export const pickAccept = (subject: PickSubject): string => acceptOf(pickKinds(subject));

/** The printed images the draft's targets use */
export const targetImagesOf = (spreads: readonly { targets: readonly { imageSrc?: string }[] }[]): Set<string> =>
  new Set(spreads.flatMap(spread => spread.targets.map(target => target.imageSrc ?? "")).filter(Boolean));
