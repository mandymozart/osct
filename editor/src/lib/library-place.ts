import type { Asset } from "./api";

/** Where the content's files live below the assets base (`ContentVersion::CONTENT_PREFIX`) */
const CONTENT_PREFIX = "/assets/content/";

/**
 * Where a library file belongs. The import names its files after their role (`image.jpg`, `target.jpg`, `video.mp4`)
 * in a folder per entry or spread (`/assets/content/entries/p015-1/target.jpg`), so the name alone tells nothing:
 * `place` is the folder below the collection (`p015-1`), `label` the place and the role (`p015-1 · target`).
 * An upload (or a file outside the content) has no place; its label is its name.
 */
export interface AssetPlace {
  /** `entries`, `spreads`, `plugins` … – null without a place */
  collection: string | null;
  place: string | null;
  /** The file's role, its name without the extension (`target`, `video`) – null without a place */
  role: string | null;
  label: string;
}

export function assetPlace(asset: Pick<Asset, "name" | "url">): AssetPlace {
  const path = pathOf(asset.url);
  const at = path.indexOf(CONTENT_PREFIX);
  const parts = at < 0 ? [] : path.slice(at + CONTENT_PREFIX.length).split("/").filter(Boolean).map(safeDecode);
  if (parts.length < 3) return { collection: null, place: null, role: null, label: asset.name };
  const place = parts.slice(1, -1).join("/");
  const file = parts[parts.length - 1];
  const stem = file.includes(".") ? file.slice(0, file.lastIndexOf(".")) : file;
  return { collection: parts[0], place, role: stem, label: `${place} · ${stem}` };
}

/** The search's text: the name, the place and the collection (`p015-1`, `entries`, `target`) */
export function assetSearchText(asset: Pick<Asset, "name" | "url">): string {
  const { collection, place, label } = assetPlace(asset);
  return [asset.name, label, place, collection].filter(Boolean).join(" ").toLowerCase();
}

/** Every word of the query in the asset's search text */
export function matchesSearch(asset: Pick<Asset, "name" | "url">, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = assetSearchText(asset);
  return words.every(word => text.includes(word));
}

/** A video's duration as the library shows it: `0:04`, `12:30`, `1:02:03` (whole seconds, rounded) */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** The library's two views, remembered per browser */
export const LIBRARY_VIEWS = ["cards", "list"] as const;
export type LibraryView = (typeof LIBRARY_VIEWS)[number];
const VIEW_KEY = "osct-editor-library-view";

export function readLibraryView(): LibraryView {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    return LIBRARY_VIEWS.includes(stored as LibraryView) ? (stored as LibraryView) : "cards";
  } catch {
    return "cards";
  }
}

export function saveLibraryView(view: LibraryView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // a private window: the view is not remembered
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url, "http://local").pathname;
  } catch {
    return url;
  }
}

function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}
