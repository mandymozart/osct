import { TEXTURE_SIZES, type TextureSetData, type TextureSize } from "@shared/types/textures";
import { subtitleFileOf } from "@shared/types/subtitles";
import type { Asset } from "./api";
import { srcKey } from "./library-scope";

/**
 * What belongs together in the Library (#331) – two axes:
 *
 * - **A stack** = one picture in several quality levels: a model's map at 512 / 1024 / 2048 / 4096 px (`textures`, #260).
 *   One tile, the levels offset behind it; opened, every level is a tile of its own (replaced alone) and a missing one
 *   a slot to fill. A video's subtitles are a stack by language. Later the same for image / video / audio levels (#13).
 * - **A frame** = the parts of one thing: a model – its mesh and the stacks of its maps (later normals, clips, scripts);
 *   a video – the film and its subtitles. The Library draws a frame around them.
 *
 * Where they come from: only the links the content has – a model node's file and its `textures` (what the reader
 * loads), a subtitle file's video (`speak.en.vtt` → `speak.mp4`: the content contract pairs them by name, as the content
 * build does). **The Library only shows them, it makes no link** (Tilman, 2026-11-19): a level is added in the
 * Inspector's *textures* of the model node; replacing one level's file keeps every link. Files no node names stay
 * single tiles. Pure: the panel passes the draft's scenes and the Library's files.
 */

/** A level of a stack: its label (`512`, `en`), the size it stands for (maps), the file – null = missing (a slot) */
export interface StackLevel {
  label: string;
  size?: TextureSize;
  asset: Asset | null;
}

export interface LibraryStack {
  /** Stable key (`map:<mesh>#<material>`, `subs:<video>`) */
  key: string;
  kind: "map" | "subtitles";
  /** What the tile calls it: the material (`map` for every material), `subtitles` */
  label: string;
  /** The levels, smallest first; for a map from the draft every size of TEXTURE_SIZES (the ones missing as slots) up to the largest there is, and the next one up as optional */
  levels: StackLevel[];
  /** The file that stands for the stack: the largest level there is */
  face: Asset;
  /** Where it is set: the model node's target and the set's place in its `textures` (a missing level is added there, in the Inspector) */
  node?: { targetId: string; mesh: string; set: number };
}

export interface LibraryFrame {
  key: string;
  kind: "model" | "video";
  label: string;
  /** The main file (the mesh, the film) – null when the Library does not hold it (an imported file missing) */
  main: Asset | null;
  stacks: LibraryStack[];
}

export interface LibrarySets {
  frames: LibraryFrame[];
  /** Every stack, in a frame or not */
  stacks: LibraryStack[];
  /** The stack or frame a file belongs to, by asset id */
  stackOf: Map<string, LibraryStack>;
  frameOf: Map<string, LibraryFrame>;
}

/** The parts of the draft a set is read from: every target's node tree */
export interface SetScene {
  targets: readonly { id: string; entity?: unknown }[];
}

/** A file's name without the folder and the extension */
const baseName = (name: string): string => name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");

/** The model files and their sets in a node tree, with the target they are on */
interface ModelUse {
  targetId: string;
  mesh: string;
  textures: readonly TextureSetData[];
  name?: string;
}

const modelsIn = (node: unknown, targetId: string, out: ModelUse[]): void => {
  if (!node || typeof node !== "object") return;
  const data = node as { type?: unknown; name?: unknown; assets?: unknown; children?: unknown };
  if (Array.isArray(data.assets)) {
    for (const asset of data.assets as { src?: unknown; textures?: unknown }[]) {
      if (typeof asset?.src === "string" && /\.(glb|gltf)([?#]|$)/i.test(asset.src)) {
        out.push({ targetId, mesh: asset.src, textures: Array.isArray(asset.textures) ? (asset.textures as TextureSetData[]) : [], name: typeof data.name === "string" ? data.name : undefined });
      }
    }
  }
  if (Array.isArray(data.children)) for (const child of data.children) modelsIn(child, targetId, out);
};

/** The levels of a map stack: each size from the smallest there is to the largest, the missing ones as slots, one more up as optional (not past 4096) */
const mapLevels = (bySize: ReadonlyMap<TextureSize, Asset | null>): StackLevel[] => {
  const there = TEXTURE_SIZES.filter(size => bySize.has(size));
  if (!there.length) return [];
  const top = TEXTURE_SIZES.indexOf(there[there.length - 1]);
  // From 512: a set without its small sizes is missing them (the reader falls back to the smallest there is)
  return TEXTURE_SIZES.slice(0, Math.min(top + 2, TEXTURE_SIZES.length)).map(size => ({ label: String(size), size, asset: bySize.get(size) ?? null }));
};

/** The largest level that is there */
const faceOf = (levels: readonly StackLevel[]): Asset | null => [...levels].reverse().find(level => level.asset)?.asset ?? null;

/** A level slot past the largest file is optional (shown, not counted as missing) */
export const isOptionalLevel = (stack: LibraryStack, level: StackLevel): boolean => {
  if (level.asset || stack.kind !== "map") return false;
  const face = stack.levels.findIndex(l => l.asset === stack.face);
  return stack.levels.indexOf(level) > face;
};

/** How many levels the stack has, and how many it should have (the missing slots below the largest) */
export const levelCount = (stack: LibraryStack): { there: number; of: number } => {
  const there = stack.levels.filter(level => level.asset).length;
  return { there, of: stack.levels.filter(level => level.asset || !isOptionalLevel(stack, level)).length };
};

/**
 * The stacks and frames of the Library: the draft's models (a frame per model file, a stack per texture set) and the
 * videos with their subtitles.
 */
export function librarySets(assets: readonly Asset[], scenes: readonly SetScene[]): LibrarySets {
  const byKey = new Map(assets.map(asset => [srcKey(asset.url), asset]));
  const find = (src: string) => byKey.get(srcKey(src)) ?? null;
  const frames = new Map<string, LibraryFrame>();
  const stacks: LibraryStack[] = [];
  const stackOf = new Map<string, LibraryStack>();
  const frameOf = new Map<string, LibraryFrame>();
  const take = (stack: LibraryStack, frame: LibraryFrame | null) => {
    stacks.push(stack);
    for (const level of stack.levels) if (level.asset) {
      stackOf.set(level.asset.id, stack);
      if (frame) frameOf.set(level.asset.id, frame);
    }
  };

  // ── the draft's models ──
  const uses: ModelUse[] = [];
  for (const scene of scenes) for (const target of scene.targets) modelsIn(target.entity, target.id, uses);
  for (const use of uses) {
    const key = `model:${srcKey(use.mesh)}`;
    if (frames.has(key)) continue; // a second node with the same model: its sets are the first one's
    const main = find(use.mesh);
    const frame: LibraryFrame = { key, kind: "model", label: use.name || baseName(main?.name ?? use.mesh).replace(/[-_]mesh$/, ""), main, stacks: [] };
    use.textures.forEach((set, index) => {
      const bySize = new Map<TextureSize, Asset | null>(set.sizes.map(entry => [entry.size, find(entry.src)]));
      const levels = mapLevels(bySize);
      const face = faceOf(levels);
      if (!face) return;
      const stack: LibraryStack = {
        key: `map:${srcKey(use.mesh)}#${set.material ?? ""}`, kind: "map", label: set.material || "map", levels, face,
        node: { targetId: use.targetId, mesh: use.mesh, set: index },
      };
      frame.stacks.push(stack);
      take(stack, frame);
    });
    // A model without sets is a file like any other (what is inside it shows on its tile)
    if (!frame.stacks.length) continue;
    frames.set(key, frame);
    if (main) frameOf.set(main.id, frame);
  }

  // ── a video's subtitles: one stack by language, the video's frame ──
  const videos = new Map(assets.filter(asset => asset.kind === "video").map(video => [baseName(video.name), video]));
  const subtitles = new Map<string, StackLevel[]>();
  for (const asset of assets) {
    if (asset.kind !== "subtitles") continue;
    const file = subtitleFileOf(asset.name);
    if (!file || !videos.has(file.video)) continue;
    subtitles.set(file.video, [...(subtitles.get(file.video) ?? []), { label: file.language, asset }]);
  }
  for (const [name, levels] of subtitles) {
    const video = videos.get(name)!;
    levels.sort((a, b) => a.label.localeCompare(b.label));
    const frame: LibraryFrame = { key: `video:${srcKey(video.url)}`, kind: "video", label: name, main: video, stacks: [] };
    const stack: LibraryStack = { key: `subs:${srcKey(video.url)}`, kind: "subtitles", label: "subtitles", levels, face: levels[0].asset! };
    frame.stacks.push(stack);
    take(stack, frame);
    frames.set(frame.key, frame);
    frameOf.set(video.id, frame);
  }

  return { frames: [...frames.values()], stacks, stackOf, frameOf };
}

/** One item of a group's grid: a frame (its parts inside), a stack, a single file – in the order of the group's files */
export type LibraryItem =
  | { type: "frame"; key: string; frame: LibraryFrame }
  | { type: "stack"; key: string; stack: LibraryStack }
  | { type: "file"; key: string; asset: Asset };

/**
 * A group's files as the grid shows them: a file of a frame brings the whole frame (once, where its first file is), a
 * level brings its stack (once), the rest stay files. `stacked` false = every file alone (the browser's *levels: single*).
 */
export function libraryItems(assets: readonly Asset[], sets: LibrarySets, stacked = true): LibraryItem[] {
  if (!stacked) return assets.map(asset => ({ type: "file", key: asset.id, asset }));
  const items: LibraryItem[] = [];
  const seen = new Set<string>();
  for (const asset of assets) {
    const frame = sets.frameOf.get(asset.id);
    const stack = sets.stackOf.get(asset.id);
    const key = frame ? frame.key : stack ? stack.key : asset.id;
    if (seen.has(key)) continue;
    seen.add(key);
    if (frame) items.push({ type: "frame", key, frame });
    else if (stack) items.push({ type: "stack", key, stack });
    else items.push({ type: "file", key, asset });
  }
  return items;
}

/** The files of a frame, as the Library holds them: the main file and every level */
export const frameFiles = (frame: LibraryFrame): Asset[] =>
  [...(frame.main ? [frame.main] : []), ...frame.stacks.flatMap(stack => stack.levels.flatMap(level => (level.asset ? [level.asset] : [])))];

/** The weight of files together */
export const filesSize = (files: readonly Pick<Asset, "size">[]): number => files.reduce((sum, file) => sum + file.size, 0);

/** A stack's range in words: `512 – 2048`, `de · en · fr` */
export const stackRange = (stack: LibraryStack): string => {
  const there = stack.levels.filter(level => level.asset).map(level => level.label);
  if (stack.kind === "subtitles") return there.join(" · ");
  return there.length > 1 ? `${there[0]} – ${there[there.length - 1]}` : (there[0] ?? "");
};
