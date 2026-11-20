import type { AssetKind } from "@shared/api/rules";
import type { Asset } from "./api";
import { nodeAssetKinds } from "./library-pick";

/**
 * The Library's leftovers of #330, the pure parts: where a dragged tile may land (`dropFit`) and a name given by hand
 * (`cleanAssetName`, the API's `AssetNames::cleanName`). **The Library makes no link** (Tilman, 2026-11-19): a drop on a
 * tree row is the tree's action – the row's node takes the file the way the Inspector's *Use* does, a target row takes a
 * picture as its printed image; the tile is only where the drag starts.
 */

/** A row of the tree a tile can be dropped on: a target (its printed image) or a node of its entity (its file) */
export type DropRow =
  | { kind: "target"; targetId: string }
  | { kind: "node"; targetId: string; path: number[]; nodeType: string };

/** What a drop there does – or why it does nothing */
export type DropFit =
  | { ok: true; action: "target" | "node"; text: string }
  | { ok: false; text: string };

/** A kind in words, for the refusals */
const KIND_WORDS: Record<AssetKind, string> = {
  image: "picture", video: "video", glb: "3D model", gltf: "3D model", audio: "sound", shader: "shader", subtitles: "subtitle file",
};
export const kindWord = (kind: AssetKind): string => KIND_WORDS[kind] ?? kind;
const article = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

/**
 * Where `asset` may land on `row` (null: over no row – nothing to say). A target takes a picture as its printed image; a
 * node takes the file kinds its type takes (`nodeAssetKinds` – model → glb / gltf, image → picture, video → video, a
 * plugin's node type its declared `src`); a shader or a subtitle file is no node's file.
 */
export const dropFit = (
  asset: Pick<Asset, "kind" | "name">,
  row: DropRow | null,
  kindsOf: (type: string) => readonly AssetKind[] | undefined = nodeAssetKinds,
): DropFit | null => {
  if (!row) return null;
  const what = kindWord(asset.kind);
  if (row.kind === "target") {
    return asset.kind === "image"
      ? { ok: true, action: "target", text: `${asset.name} becomes the printed image of ${row.targetId}` }
      : { ok: false, text: `A target's printed image is a picture – not ${article(what)}` };
  }
  const kinds = kindsOf(row.nodeType);
  const aNode = article(row.nodeType).replace(/^a/, "A");
  if (!kinds?.length) return { ok: false, text: `${aNode} node takes no file` };
  if (!kinds.includes(asset.kind)) {
    const takes = [...new Set(kinds.map(kindWord))].map(article).join(" or ");
    return { ok: false, text: `${aNode} node takes ${takes} – not ${article(what)}` };
  }
  return { ok: true, action: "node", text: `The ${row.nodeType} node takes ${asset.name}` };
};

/**
 * A tree row's drop data, as `TreePanel` writes it on the row (`data-drop`, `data-target`, `data-path`, `data-node-type`) –
 * null for a row that takes no drop
 */
export const dropRowOf = (data: DOMStringMap): DropRow | null => {
  const targetId = data.target;
  if (!targetId) return null;
  if (data.drop === "target") return { kind: "target", targetId };
  if (data.drop === "node" && data.nodeType) {
    return { kind: "node", targetId, path: data.path ? data.path.split(".").map(Number) : [], nodeType: data.nodeType };
  }
  return null;
};

/** The longest file name (the API's `AssetNames::NAME_MAX`) */
export const NAME_MAX = 255;

/** The stored file's extension (its URL's, else its name's) in lower case – the one a rename keeps */
export const storedExtension = (asset: Pick<Asset, "url" | "name">): string => {
  const ext = (value: string) => /\.([A-Za-z0-9]+)$/.exec(value)?.[1]?.toLowerCase() ?? "";
  const path = asset.url.split(/[?#]/)[0] ?? "";
  return ext(path) || ext(asset.name);
};

/** A name's part before the stored extension – what the rename field edits (`Desk photo.webp` → `Desk photo`) */
export const nameStem = (name: string, extension: string): string =>
  extension && name.toLowerCase().endsWith(`.${extension}`) ? name.slice(0, -extension.length - 1) : name;

/**
 * A name given by hand (#330 – the API's `AssetNames::cleanName`, the same rule): white space folded, no slash,
 * backslash or control character, not empty, `.` or `..`, at most NAME_MAX characters – and the stored extension at its
 * end (added when the name lacks it: `castle` → `castle.glb`; one typed in any case stays as typed)
 */
export const cleanAssetName = (raw: string, extension: string): { name: string } | { problem: string } => {
  // eslint-disable-next-line no-control-regex
  if (/[/\\\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw)) return { problem: "A name holds no slash, backslash or control character." };
  const name = raw.replace(/\s+/gu, " ").trim();
  const suffix = extension ? `.${extension}` : "";
  const typed = !!suffix && name.toLowerCase().endsWith(suffix);
  const stem = (typed ? name.slice(0, -suffix.length) : name).replace(/[ .]+$/, "");
  if (!stem) return { problem: "The name is empty." };
  const full = stem + (typed ? name.slice(-suffix.length) : suffix);
  if ([...full].length > NAME_MAX) return { problem: `The name is longer than ${NAME_MAX} characters.` };
  return { name: full };
};
