import type { Asset, Usage } from "./api";
import { assetLabel, formatSize, groupByScene, moreUses, type LibraryGroup } from "./library-place";
import { isTargetImage, type LibraryFilter } from "./library-pick";
import type { SelectionState } from "./selection";
import { readStored, writeStored } from "#lib/storage.js";

/**
 * The Library's scope and order (#330): which files it shows before the kinds – the open scene's (what its surfaces,
 * targets, entries and their nodes use), all of them, or the unused ones (no scene, entry, environment or plugin uses
 * them) –, how many each holds, the sort, the groups (in *All* the open scene's files pinned on top, then the unused,
 * then the other scenes) and where a use of a file leads (a click in the details selects that target, entry or surface).
 * Pure: the panel and the browser pass the draft's scenes and the surfaces' reference images.
 */

/** Where the content's files live below the assets base (`library-place.ts`) */
const CONTENT_PREFIX = "/assets/content/";

/**
 * What a src and a Library URL are compared by: an imported file's content path (`/assets/content/…` – the draft names it
 * so, the Library lists it with the assets base before it), an upload's whole URL
 */
export const srcKey = (src: string): string => {
  const at = src.indexOf(CONTENT_PREFIX);
  return at < 0 ? src : src.slice(at).split(/[?#]/)[0];
};

/** A use of a file in a scene, found in the draft: a target's printed image, an entry's picture, a surface's reference image, a node's file */
export interface SceneUse {
  kind: "target" | "entry" | "reference" | "node";
  /** The target's or the entry's id, `scene/surface` for a reference image (as the API's usages name it) */
  ref: string;
  sceneId: string;
}

/** The parts of a scene the index reads */
export interface IndexedScene {
  id: string;
  label?: string;
  targets: readonly { id: string; imageSrc?: string; entity?: unknown }[];
  entries?: readonly { id: string; image?: string }[];
}

/** The surfaces' reference images by scene id and surface id (`scenes.references`) */
export type ReferenceMap = Readonly<Record<string, Readonly<Record<string, { url: string }>>>>;

/** Every string in a value (a node tree: its files, its texture maps, a plugin parameter that names a file) */
const stringsIn = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) stringsIn(item, out);
  return out;
};

/**
 * The draft's uses of files, by `srcKey`: per scene its surfaces' reference images, its targets' printed images, the files
 * its targets' nodes name (any string of the tree – a model, a video, a texture map) and its entries' pictures
 */
export function libraryIndex(scenes: readonly IndexedScene[], references: ReferenceMap = {}): Map<string, SceneUse[]> {
  const index = new Map<string, SceneUse[]>();
  const add = (src: string | undefined, use: SceneUse) => {
    if (!src) return;
    const key = srcKey(src);
    const uses = index.get(key);
    if (!uses) index.set(key, [use]);
    else if (!uses.some(u => u.kind === use.kind && u.ref === use.ref)) uses.push(use);
  };
  for (const scene of scenes) {
    for (const [surface, reference] of Object.entries(references[scene.id] ?? {})) add(reference.url, { kind: "reference", ref: `${scene.id}/${surface}`, sceneId: scene.id });
    for (const target of scene.targets) {
      add(target.imageSrc, { kind: "target", ref: target.id, sceneId: scene.id });
      for (const text of stringsIn(target.entity)) if (text.includes("/")) add(text, { kind: "node", ref: target.id, sceneId: scene.id });
    }
    for (const entry of scene.entries ?? []) add(entry.image, { kind: "entry", ref: entry.id, sceneId: scene.id });
  }
  return index;
}

/** The draft's uses of the file (none: the index knows none – an environment's or a plugin's use is the API's) */
export const usesOf = (asset: Pick<Asset, "url">, index: ReadonlyMap<string, readonly SceneUse[]>): readonly SceneUse[] => index.get(srcKey(asset.url)) ?? [];

/** The scenes that use the file: the index's, and the scene of its first use the API names (`Asset.place`) */
export function scenesOfAsset(asset: Pick<Asset, "url" | "place">, index: ReadonlyMap<string, readonly SceneUse[]>): Set<string> {
  const scenes = new Set(usesOf(asset, index).map(use => use.sceneId));
  if (asset.place?.scene) scenes.add(asset.place.scene);
  return scenes;
}

/** The file is used in the scene */
export const inScene = (asset: Pick<Asset, "url" | "place">, sceneId: string | null, index: ReadonlyMap<string, readonly SceneUse[]>): boolean =>
  !!sceneId && (asset.place?.scene === sceneId || usesOf(asset, index).some(use => use.sceneId === sceneId));

/** Used nowhere – no scene, entry, environment or plugin (the API's count) */
export const isUnused = (asset: Pick<Asset, "usages">): boolean => asset.usages === 0;

/** The surfaces' reference images (a kind of their own in the Library) */
export const surfaceImagesOf = (references: ReferenceMap): Set<string> =>
  new Set(Object.values(references).flatMap(surfaces => Object.values(surfaces).map(reference => reference.url)));

// ── scope ──────────────────────────────────────────────────────────────────────────────────────────────

/** The Library's scope (#330): the open scene's files, every file, the unused ones */
export const LIBRARY_SCOPES = ["scene", "all", "unused"] as const;
export type LibraryScope = (typeof LIBRARY_SCOPES)[number];

/** The scope a Library starts with: the open scene's files while a scene is open – a picker shows all (the open scene pinned on top) */
export const startScope = (sceneId: string | null | undefined, picking: boolean): LibraryScope => (sceneId && !picking ? "scene" : "all");

export const inScope = (asset: Pick<Asset, "url" | "place" | "usages">, scope: LibraryScope, sceneId: string | null, index: ReadonlyMap<string, readonly SceneUse[]>): boolean =>
  scope === "all" || (scope === "unused" ? isUnused(asset) : inScene(asset, sceneId, index));

/** How many files each scope holds */
export function scopeCounts(assets: readonly Pick<Asset, "url" | "place" | "usages">[], sceneId: string | null, index: ReadonlyMap<string, readonly SceneUse[]>): Record<LibraryScope, number> {
  let scene = 0;
  let unused = 0;
  for (const asset of assets) {
    if (inScene(asset, sceneId, index)) scene++;
    if (isUnused(asset)) unused++;
  }
  return { scene, all: assets.length, unused };
}

// ── kinds ──────────────────────────────────────────────────────────────────────────────────────────────

/** The kinds' chips (code apart: its list is under the media) */
export const KIND_LABELS: Record<LibraryFilter, string> = {
  all: "All kinds", target: "Targets", surface: "Surfaces", image: "Images", video: "Video", model: "3D", audio: "Audio", code: "Code",
};

/** What a tile's corner calls the file's kind */
export const tileKind = (asset: Pick<Asset, "kind" | "url" | "name">, targetImages: ReadonlySet<string>, surfaceImages: ReadonlySet<string>): string =>
  isTargetImage(asset, targetImages) ? "target"
    : asset.kind === "image" && surfaceImages.has(asset.url) ? "surface"
      : asset.kind === "glb" || asset.kind === "gltf" ? "3D"
        : asset.kind;

/** The browser's groups by kind: which group a file is in */
const kindGroupOf = (asset: Pick<Asset, "kind" | "url" | "name">, targetImages: ReadonlySet<string>, surfaceImages: ReadonlySet<string>): LibraryFilter | "other" => {
  if (isTargetImage(asset, targetImages)) return "target";
  if (asset.kind === "image") return surfaceImages.has(asset.url) ? "surface" : "image";
  if (asset.kind === "video" || asset.kind === "subtitles") return "video";
  if (asset.kind === "glb" || asset.kind === "gltf") return "model";
  if (asset.kind === "audio") return "audio";
  return asset.kind === "shader" ? "code" : "other";
};

/** How many files of each kind (`all` the media; `code` the shaders – the panel adds the scripts) */
export function kindCounts(assets: readonly Pick<Asset, "kind" | "url" | "name">[], targetImages: ReadonlySet<string>, surfaceImages: ReadonlySet<string>): Record<LibraryFilter, number> {
  const counts: Record<LibraryFilter, number> = { all: 0, target: 0, surface: 0, image: 0, video: 0, model: 0, audio: 0, code: 0 };
  for (const asset of assets) {
    const kind = kindGroupOf(asset, targetImages, surfaceImages);
    if (kind !== "code") counts.all++;
    if (kind !== "other") counts[kind]++;
  }
  return counts;
}

// ── the browser's places ───────────────────────────────────────────────────────────────────────────────

/** Added within the last week */
export const RECENT_DAYS = 7;
export const isRecent = (asset: Pick<Asset, "createdAt">, now: number, days = RECENT_DAYS): boolean => {
  const at = Date.parse(asset.createdAt);
  return Number.isFinite(at) && now - at <= days * 86_400_000;
};

/** A medium without its credits line (#277) – a shader or a subtitle file needs none */
export const missingCredits = (asset: Pick<Asset, "kind" | "credits">): boolean =>
  asset.kind !== "shader" && asset.kind !== "subtitles" && !asset.credits?.trim();

/** A place of the browser's sidebar beyond the scope, the kind and the origin: recently added, missing credits, one scene */
export type LibrarySpecial = { by: "recent" } | { by: "credits" } | { by: "scene"; scene: string } | null;

export const matchesSpecial = (asset: Asset, special: LibrarySpecial, now: number, index: ReadonlyMap<string, readonly SceneUse[]>): boolean =>
  !special ? true
    : special.by === "recent" ? isRecent(asset, now)
      : special.by === "credits" ? missingCredits(asset)
        : scenesOfAsset(asset, index).has(special.scene);

/** How many files each scene uses, by scene id */
export function sceneCounts(assets: readonly Pick<Asset, "url" | "place">[], index: ReadonlyMap<string, readonly SceneUse[]>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const asset of assets) for (const scene of scenesOfAsset(asset, index)) counts.set(scene, (counts.get(scene) ?? 0) + 1);
  return counts;
}

// ── sort ───────────────────────────────────────────────────────────────────────────────────────────────

export const LIBRARY_SORTS = ["name", "recent", "size", "uses"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];
export const SORT_LABELS: Record<LibrarySort, string> = { name: "name", recent: "recently added", size: "size", uses: "uses" };

const byName = (a: Asset, b: Asset) => assetLabel(a).localeCompare(assetLabel(b), undefined, { numeric: true });

/** The files in the order asked for: by name (numbers as numbers), the newest first, the largest first, the most used first – then by name */
export function sortAssets(assets: readonly Asset[], sort: LibrarySort): Asset[] {
  const list = [...assets];
  if (sort === "name") return list.sort(byName);
  if (sort === "recent") return list.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || byName(a, b));
  if (sort === "size") return list.sort((a, b) => b.size - a.size || byName(a, b));
  return list.sort((a, b) => b.usages - a.usages || byName(a, b));
}

// ── groups ─────────────────────────────────────────────────────────────────────────────────────────────

export const LIBRARY_GROUPINGS = ["scene", "kind", "none"] as const;
export type LibraryGrouping = (typeof LIBRARY_GROUPINGS)[number];

/** A group of the grid; `pinned` = the open scene's files (framed, on top) */
export interface ShownGroup extends LibraryGroup {
  pinned?: boolean;
}

export interface GroupContext {
  scope: LibraryScope;
  grouping: LibraryGrouping;
  sort: LibrarySort;
  sceneId: string | null;
  sceneLabel: string;
  scenes: readonly { id: string; label: string }[];
  index: ReadonlyMap<string, readonly SceneUse[]>;
  targetImages: ReadonlySet<string>;
  surfaceImages: ReadonlySet<string>;
}

const KIND_GROUP_ORDER: readonly (LibraryFilter | "other")[] = ["target", "surface", "image", "video", "model", "audio", "code", "other"];

/**
 * The shown files in groups: the scope *This scene* and *Unused* are one group each; *All* by scene pins the open scene's
 * files on top, then the unused ones, then a group per other scene (the scene of a file's first use, `groupByScene`) and
 * the experience-wide ones; by kind a group per kind; none one group. Every group in the sort asked for.
 */
export function libraryGroups(assets: readonly Asset[], context: GroupContext): ShownGroup[] {
  const { scope, grouping, sort, sceneId, index } = context;
  const sorted = (list: readonly Asset[]) => sortAssets(list, sort);
  if (!assets.length) return [];
  if (scope === "scene") return [{ key: "open", label: context.sceneLabel, assets: sorted(assets), pinned: true }];
  if (scope === "unused" && grouping !== "kind") return [{ key: "unused", label: "Unused", assets: sorted(assets) }];
  if (grouping === "none") return [{ key: "all", label: "All files", assets: sorted(assets) }];
  if (grouping === "kind") {
    const byKind = new Map<string, Asset[]>();
    for (const asset of assets) {
      const kind = kindGroupOf(asset, context.targetImages, context.surfaceImages);
      byKind.set(kind, [...(byKind.get(kind) ?? []), asset]);
    }
    return KIND_GROUP_ORDER.filter(kind => byKind.has(kind))
      .map(kind => ({ key: `kind:${kind}`, label: kind === "other" ? "Other" : KIND_LABELS[kind], assets: sorted(byKind.get(kind)!) }));
  }
  const open = sceneId ? assets.filter(asset => inScene(asset, sceneId, index)) : [];
  const openIds = new Set(open.map(asset => asset.id));
  const rest = groupByScene(assets.filter(asset => !openIds.has(asset.id)), context.scenes);
  const unused = rest.filter(group => group.key === "unused");
  const groups: ShownGroup[] = [];
  if (open.length) groups.push({ key: "open", label: context.sceneLabel, assets: sorted(open), pinned: true });
  for (const group of [...unused, ...rest.filter(g => g.key !== "unused")]) groups.push({ ...group, assets: sorted(group.assets) });
  return groups;
}

/** A group starts folded in *All*: every group but the open scene's (a search unfolds them all) */
export const startsFolded = (group: ShownGroup, scope: LibraryScope): boolean => scope === "all" && !group.pinned;

// ── uses ───────────────────────────────────────────────────────────────────────────────────────────────

/** An imported file's uses as the API would name them (it lists none for an imported file): the draft's, from the index */
export const indexUsages = (asset: Pick<Asset, "url">, index: ReadonlyMap<string, readonly SceneUse[]>): Usage[] =>
  usesOf(asset, index).map(use => ({ kind: use.kind === "node" ? "target" : use.kind, ref: use.ref }));

/** A use in words (`target p015-1`, `reference image of 4–5 · front`) */
export const useWord = (usage: Usage, scenes: readonly { id: string; label: string }[] = []): string => {
  if (usage.kind === "reference") {
    const [scene, surface] = usage.ref.split("/");
    return `reference image · ${scenes.find(s => s.id === scene)?.label || scene}${surface ? ` · ${surface}` : ""}`;
  }
  if (usage.kind === "scene") return `scene ${scenes.find(s => s.id === usage.ref)?.label || usage.ref}`;
  if (usage.kind === "experience" || usage.kind === "environment") return usage.kind;
  return `${usage.kind} ${usage.ref}`;
};

/** The scenes' parts a use is looked up in */
export interface JumpScene {
  id: string;
  targets: readonly { id: string }[];
  entries: readonly { id: string; target?: { id: string } }[];
}

/**
 * Where a click on a use leads: the scene and what to select there – a target, an entry (with its target), a surface, the
 * scene. Null for a use with no place on a scene (the environment, a plugin, a shared entity, the experience).
 */
export function usageJump(usage: Usage, scenes: readonly JumpScene[]): { sceneId: string; select: SelectionState } | null {
  const base: SelectionState = { target: null, node: [], onTarget: true };
  if (usage.kind === "target") {
    const scene = scenes.find(s => s.targets.some(t => t.id === usage.ref));
    return scene ? { sceneId: scene.id, select: { ...base, target: usage.ref } } : null;
  }
  if (usage.kind === "entry") {
    for (const scene of scenes) {
      const entry = scene.entries.find(e => e.id === usage.ref);
      if (entry) return { sceneId: scene.id, select: { ...base, target: entry.target?.id ?? null, entry: entry.id } };
    }
    return null;
  }
  if (usage.kind === "reference") {
    const [sceneId, surface] = usage.ref.split("/");
    return scenes.some(s => s.id === sceneId) && surface ? { sceneId, select: { ...base, surface: { scene: sceneId, id: surface } } } : null;
  }
  if (usage.kind === "scene") return scenes.some(s => s.id === usage.ref) ? { sceneId: usage.ref, select: { ...base, scene: true } } : null;
  return null;
}

// ── the tiles' size ────────────────────────────────────────────────────────────────────────────────────

/** The tiles' width in rem, remembered per browser */
export const TILE_SIZE = { min: 5, max: 12, step: 0.5, start: 7 } as const;
const TILE_KEY = "osct-editor-library-tile";

export function readTileSize(): number {
  const stored = Number(readStored(TILE_KEY));
  return Number.isFinite(stored) && stored >= TILE_SIZE.min && stored <= TILE_SIZE.max ? stored : TILE_SIZE.start;
}

export function saveTileSize(size: number): void {
  writeStored(TILE_KEY, String(size));
}

/** The sort, remembered per browser */
const SORT_KEY = "osct-editor-library-sort";
export function readLibrarySort(): LibrarySort {
  const stored = readStored(SORT_KEY);
  return LIBRARY_SORTS.includes(stored as LibrarySort) ? (stored as LibrarySort) : "name";
}
export function saveLibrarySort(sort: LibrarySort): void {
  writeStored(SORT_KEY, sort);
}

/** The file's format as its details name it: the extension in capitals (`WEBP`, `GLB`) – the media type's subtype else */
export const formatOf = (asset: Pick<Asset, "name" | "mime">): string => {
  const dot = asset.name.lastIndexOf(".");
  if (dot > 0 && dot < asset.name.length - 1) return asset.name.slice(dot + 1).toUpperCase();
  return (asset.mime.split("/")[1] ?? asset.mime).toUpperCase();
};

/**
 * The next selection of the browser's grid after a click: a plain click one file, Ctrl / ⌘ adds or takes one, Shift
 * the run from the anchor to it (in the order shown)
 */
export function nextChosen(
  chosen: readonly string[], anchor: string | null, id: string, order: readonly string[], keys: { shift?: boolean; toggle?: boolean },
): { chosen: string[]; anchor: string | null } {
  if (keys.shift && anchor) {
    const from = order.indexOf(anchor);
    const to = order.indexOf(id);
    if (from >= 0 && to >= 0) {
      const run = order.slice(Math.min(from, to), Math.max(from, to) + 1);
      return { chosen: [...new Set([...chosen, ...run])], anchor };
    }
  }
  if (keys.toggle) return chosen.includes(id) ? { chosen: chosen.filter(c => c !== id), anchor: id } : { chosen: [...chosen, id], anchor: id };
  return { chosen: [id], anchor: id };
}

/** A tile's one meta line: *just uploaded*, the picture's size, the file's size, its version, its further uses (`2048×1425 · 77 kB · +2 more`) */
export function tileMeta(asset: Pick<Asset, "width" | "height" | "size" | "version" | "place">, fresh = false): string {
  const parts: string[] = [];
  if (fresh) parts.push("just uploaded");
  if (asset.width && asset.height) parts.push(`${asset.width}×${asset.height}`);
  parts.push(formatSize(asset.size));
  if (asset.version > 1) parts.push(`v${asset.version}`);
  const more = moreUses(asset);
  if (more) parts.push(more);
  return parts.join(" · ");
}
