import { isTextureSize, type TextureSetData, type TextureSize } from "@shared/types/textures";
import type { EntityData } from "@engine/types";
import type { Asset } from "./api";

/**
 * A model node's texture sets in the Inspector (#260, content schema 2.27): the model file carries its smallest map,
 * the sets name the same map at 512, 1024, 2048 and 4096 px – the reader's texture quality chooses. A map's size is
 * read from the file (the Library knows a picture's pixels), never typed: a map is square and one of the four sizes.
 * A set without a material is the map of every material of the model; a model with a map per material has a set each.
 */

/** The size a Library picture is as a map, or why it is none */
export const textureSizeOf = (asset: Pick<Asset, "kind" | "name" | "width" | "height">): { size: TextureSize } | { problem: string } => {
  if (asset.kind !== "image") return { problem: `${asset.name} is no picture.` };
  if (asset.width === null || asset.height === null) return { problem: `${asset.name}: the file does not tell its size.` };
  if (asset.width !== asset.height || !isTextureSize(asset.width)) {
    return { problem: `${asset.name} is ${asset.width} × ${asset.height} px – a map is square, 512, 1024, 2048 or 4096 px wide.` };
  }
  return { size: asset.width };
};

/** The sets with this map in the set at `index` (a new set past the end): its size takes the file, smallest first */
export const withTexture = (sets: readonly TextureSetData[] | undefined, index: number, size: TextureSize, src: string): TextureSetData[] => {
  const next = (sets ?? []).map(set => ({ ...set, sizes: [...set.sizes] }));
  const set = next[index] ?? (next[next.length] = { sizes: [] });
  set.sizes = [...set.sizes.filter(entry => entry.size !== size), { size, src }].sort((a, b) => a.size - b.size);
  return next;
};

/** The sets without that size; a set that loses its last size goes, and with the last set the list (`undefined`) */
export const withoutTexture = (sets: readonly TextureSetData[] | undefined, index: number, size: TextureSize): TextureSetData[] | undefined => {
  const next = (sets ?? [])
    .map((set, i) => (i === index ? { ...set, sizes: set.sizes.filter(entry => entry.size !== size) } : set))
    .filter(set => set.sizes.length);
  return next.length ? next : undefined;
};

/** The sets with the set at `index` named for a material ("" = every material) */
export const withMaterial = (sets: readonly TextureSetData[], index: number, material: string): TextureSetData[] =>
  sets.map((set, i) => {
    if (i !== index) return set;
    const { material: _, ...rest } = set;
    return material.trim() ? { ...rest, material: material.trim() } : rest;
  });

/** The node with these sets on its model file (none = the file's own map only) */
export const setNodeTextures = (node: EntityData, textures: TextureSetData[] | undefined): EntityData => ({
  ...node,
  assets: node.assets.map((asset, i) => {
    if (i !== 0) return asset;
    const { textures: _, ...rest } = asset;
    return textures?.length ? { ...rest, textures } : rest;
  }),
});
