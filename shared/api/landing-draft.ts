/**
 * The landing's hero from an experience's draft (#355) – what the editor runs when the person picks a target ("Use for
 * the landing page", the Inspector's refresh) and the MCP server's `put_experience_landing`: the draft's configuration
 * and files.json (as `GET …/draft/<build>/…` hands them out – every content path below the import's assets base) and
 * the print layout of the import, read with the given fetch. The stored result names content paths again
 * (`/assets/content/…`, RULES #36): publish writes them below the assets base, as it does the configuration's.
 */
import type { GameConfiguration } from "../types/game-config";
import type { ExperienceLanding, LandingPick } from "../types/landing";
import { extractExperienceLanding, LAYOUT_FILE, LAYOUT_PATH, type LandingLayout, type LayoutSheet, landingPickProblem, landingSourceOf } from "./landing-extract";

const CONTENT_PREFIX = "/assets/content/";

/** Where a content file of the draft is: the files.json key that ends with its path (an earlier build's folder), else below the base; null without either */
export const draftFileUrl = (fileKeys: readonly string[], assetsBase: string, path: string): string | null =>
  fileKeys.find(key => key.endsWith(path)) ?? (assetsBase ? `${assetsBase.replace(/\/+$/, "")}${path}` : null);

/** Every `<assetsBase>/assets/content/…` string in a JSON value back to its content path (`/assets/content/…`) */
export const withContentPaths = <T>(value: T, assetsBase: string): T => {
  const base = (assetsBase ?? "").replace(/\/+$/, "");
  if (!base) return value;
  const back = (item: unknown): unknown => {
    if (typeof item === "string") return item.startsWith(`${base}${CONTENT_PREFIX}`) ? item.slice(base.length) : item;
    if (Array.isArray(item)) return item.map(back);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, back(entry)]));
    return item;
  };
  return back(value) as T;
};

/** The draft's print layout (none without one, or when it cannot be read): its sheets, each picture where the draft's files name it */
export const draftLayout = async (files: Record<string, unknown>, assetsBase: string, fetchFn: typeof globalThis.fetch): Promise<LandingLayout | undefined> => {
  const keys = Object.keys(files);
  const url = draftFileUrl(keys, assetsBase, LAYOUT_FILE);
  if (!url) return undefined;
  try {
    const response = await fetchFn(url);
    const data = response.ok ? ((await response.json()) as { sheets?: unknown }) : null;
    if (!Array.isArray(data?.sheets)) return undefined;
    return { sheets: data.sheets as LayoutSheet[], url: image => draftFileUrl(keys, assetsBase, `${LAYOUT_PATH}${image}`) ?? `${LAYOUT_PATH}${image}` };
  } catch {
    return undefined;
  }
};

export interface DraftLandingInput {
  /** The draft's configuration and files.json as the draft endpoint hands them out */
  configuration: GameConfiguration;
  files: Record<string, unknown>;
  /** The experience's assets base (the import's; "" = none) */
  assetsBase: string;
  /** Reads the layout (a public file of the import) */
  fetch: typeof globalThis.fetch;
}

/**
 * The pick with its hero extracted from the draft, in content paths – or why the pick cannot be the hero (an unknown
 * scene or target, a target without AR content)
 */
export const extractDraftLanding = async (input: DraftLandingInput, pick: LandingPick): Promise<{ landing: ExperienceLanding } | { problem: string }> => {
  const source = landingSourceOf(input.configuration);
  const problem = landingPickProblem(source, pick);
  if (problem) return { problem };
  const layout = await draftLayout(input.files, input.assetsBase, input.fetch);
  const landing = extractExperienceLanding(source, pick, layout);
  return landing ? { landing: withContentPaths(landing, input.assetsBase) } : { problem: "the target cannot be the landing's hero" };
};
