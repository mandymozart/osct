import type { GameConfiguration } from "@engine/types";
import { ApiError, type ImportPreview } from "./api";

/**
 * The import's preview (#182): before anything is imported, the form says what comes in – one book, which build, from
 * where, what it holds – and whether it replaces a draft that is here. The CDN's preview is the server's
 * (`POST /editor/import/preview`, it knows the instance's content base); for a URL the form reads the content base or
 * the configuration itself and asks the server for the rest. These are the reading and the preview's words; ImportForm
 * draws them.
 */

/** A source that could not be read: the message names the URL, `url` is it alone */
export class SourceError extends Error {
  constructor(message: string, public readonly url: string) {
    super(message);
  }
}

/** A URL that names no `.json` file is a content base (a folder with latest.json); null for a configuration's URL */
export const contentBaseOf = (url: string): string | null => {
  const trimmed = url.trim();
  if (!trimmed || /\.json(\?.*)?$/i.test(trimmed)) return null;
  return trimmed.replace(/\/+$/, "");
};

/** A version folder name: the content checksum's first 12 hex digits */
const BUILD = /^[0-9a-f]{12}$/;

const readJson = async (url: string, fetcher: typeof fetch): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetcher(url, { cache: "no-store" });
  } catch {
    throw new SourceError(`${url} could not be fetched (offline, or the address does not allow this page to read it).`, url);
  }
  if (!response.ok) throw new SourceError(`${url} answered ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`, url);
  try {
    return await response.json();
  } catch {
    throw new SourceError(`${url} is not JSON.`, url);
  }
};

/** What a content base holds now */
export interface ContentBaseRead {
  contentBase: string;
  manifest: { url: string; build: string; activatedAt: string | null };
  /** `<base>/<build>` – the assets base of that version */
  versionFolder: string;
  configuration: GameConfiguration;
}

/** latest.json names the current build; its folder holds the configuration (and is its assets base) */
export const readContentBase = async (contentBase: string, fetcher: typeof fetch = fetch): Promise<ContentBaseRead> => {
  const url = `${contentBase}/latest.json`;
  const manifest = (await readJson(url, fetcher)) as { build?: unknown; activatedAt?: unknown } | null;
  const build = manifest?.build;
  if (typeof build !== "string" || !BUILD.test(build)) throw new SourceError(`${url} names no build.`, url);
  const versionFolder = `${contentBase}/${build}`;
  const configuration = await readConfiguration(`${versionFolder}/game.config.json`, fetcher);
  const activatedAt = typeof manifest?.activatedAt === "string" ? manifest.activatedAt : null;
  return { contentBase, manifest: { url, build, activatedAt }, versionFolder, configuration };
};

/** A game.config.json by URL */
export const readConfiguration = async (url: string, fetcher: typeof fetch = fetch): Promise<GameConfiguration> => {
  const configuration = await readJson(url, fetcher);
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) throw new SourceError(`${url} is not a game configuration.`, url);
  return configuration as GameConfiguration;
};

/** `fb4c562…` – the build as the button and the rows name it */
export const shortBuild = (build: string | null | undefined): string | null => (build ? `${build.slice(0, 7)}…` : null);

/** The import button: `Import 1 book: The Demo Book (build fb4c562…)` */
export const importLabel = (p: ImportPreview): string => {
  const build = shortBuild(p.incoming.build);
  return `Import 1 book: ${p.incoming.title}${build ? ` (build ${build})` : ""}`;
};

/** `1 entry`, `3 entries` */
export const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** `6 spreads · 13 entries · 8 targets · 3 shared entities` */
export const contentsLine = (counts: ImportPreview["counts"]): string =>
  [count(counts.spreads, "spread"), count(counts.entries, "entry", "entries"), count(counts.targets, "target"), ...(counts.entities ? [count(counts.entities, "shared entity", "shared entities")] : [])].join(" · ");

/** An ISO time in the browser's short local form; null for none, the text itself when it is no time */
export const date = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

/** One row of the preview */
export interface PreviewRow {
  label: string;
  value: string;
}

/**
 * What comes in, row by row: where from (the content base, else the configuration's URL or file), the build and when
 * it was built (and made current on the CDN), the app and schema version, the book and what it holds, the assets base
 */
export const previewRows = (p: ImportPreview, from: string | null, assetsAt: string | null): PreviewRow[] => {
  const activated = date(p.manifest?.activatedAt);
  const rows: PreviewRow[] = [
    { label: "From", value: from || "–" },
    { label: "Build", value: p.incoming.build ?? "–" },
    { label: "Built", value: [date(p.incoming.date) ?? "–", activated ? `current since ${activated}` : null].filter(Boolean).join(" · ") },
    { label: "App version", value: p.incoming.appVersion ?? "–" },
    { label: "Schema", value: p.incoming.schema ?? "–" },
    { label: "Book", value: `${p.incoming.title} · ${p.incoming.book}` },
    { label: "Holds", value: contentsLine(p.counts) },
  ];
  if (assetsAt) rows.push({ label: "Assets at", value: assetsAt });
  return rows;
};

/** A draft of that id is here: the import replaces it – null for a new book */
export const replaceLine = (p: ImportPreview): string | null => {
  const c = p.existing;
  if (!c) return null;
  const same = c.same ? " based on this build" : "";
  return `A draft of “${c.book.title}” (${c.book.id})${same} is already here – importing replaces it.`;
};

/** What of that draft is lost: its edits since its import – unpublished, unless the draft as it is now is live */
export const lossLine = (p: ImportPreview): string | null => {
  const c = p.existing;
  if (!c) return null;
  const n = c.draft.edits;
  const since = c.draft.basedOn?.importedAt ? "since its import" : "in its change log";
  if (n === 0) return `It has no edits ${since} – nothing of its own is lost.`;
  const published = c.draft.live.some(l => l.current);
  return `Its ${count(n, published ? "edit" : "unpublished edit")} ${since} ${n === 1 ? "is" : "are"} lost.`;
};

/** An error of reading or previewing as the form shows it, with the URL that failed when there is one */
export const sourceErrorLine = (error: unknown): { message: string; url: string | null } => {
  if (error instanceof SourceError) return { message: error.message, url: error.url };
  if (error instanceof ApiError) return { message: `${error.message} (${error.code})`, url: typeof error.details.url === "string" ? error.details.url : null };
  return { message: error instanceof Error ? error.message : String(error), url: null };
};
