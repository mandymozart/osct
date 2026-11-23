import type { PluginSummary } from "./api";

/**
 * The guard before others' plugin code (#340, docs/editor.md "The plugin guard"). The editor's stage runs the experience's
 * plugins in the editor's own page – with the signed-in editor's session, so a plugin can do what that person may do
 * through the API. Code the person saved last runs by itself; code someone else saved last (or code that came with an
 * imported content build and was saved by no one here) runs only after the person said *Run* once. The answer is kept in
 * this browser per experience and per source version: a new save by someone else asks again.
 */

/** A plugin whose code the signed-in person did not save last */
export interface GuardSource {
  id: string;
  /** `saved` – a stored source of the Code tab; `declared` – a module the content declares that has no stored source */
  kind: "saved" | "declared";
  /** Who saved it last (an email), null when nobody here did (a declared module) or the account is gone */
  savedBy: string | null;
  /** The source's version: when, by whom and how long it was saved, or the declared module's URL (a new content build is another) */
  version: string;
}

export type GuardAnswer = "run" | "skip";
export type GuardAnswers = Record<string, GuardAnswer>;

/** How a person is named in the prompt: the local part of their address */
export const whoName = (email: string | null): string => (email ? email.split("@")[0] : "an account no longer on this instance");

/** Who a source is named after in the prompt and in the Code tab */
export const sourceOrigin = (source: GuardSource): string =>
  source.kind === "declared" ? "the imported content (no saved source)" : whoName(source.savedBy);

const same = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The plugins the guard asks about: every stored source someone other than `me` saved last, and every declared module
 * without a stored source (its stored source would run instead – `keepPlugin`)
 */
export const foreignSources = (
  stored: readonly Pick<PluginSummary, "id" | "updatedAt" | "updatedBy" | "size">[],
  declared: readonly { id: string; src: string }[],
  me: string | null,
): GuardSource[] => {
  const saved: GuardSource[] = stored
    .filter(p => !same(p.updatedBy, me))
    .map(p => ({ id: p.id, kind: "saved", savedBy: p.updatedBy ?? null, version: `${p.updatedAt}|${p.updatedBy ?? ""}|${p.size}` }));
  const storedIds = new Set(stored.map(p => p.id));
  const modules: GuardSource[] = declared
    .filter(p => !storedIds.has(p.id))
    .map(p => ({ id: p.id, kind: "declared", savedBy: null, version: p.src }));
  return [...saved, ...modules];
};

/** An answer's key: the plugin and its version */
export const answerKey = (source: GuardSource): string => `${source.id}@${source.version}`;

const storageKey = (experienceId: string) => `osct-plugin-guard:${experienceId}`;

/** The answers kept for an experience in this browser (none when storage is blocked) */
export const readAnswers = (experienceId: string, storage: Storage | null = safeStorage()): GuardAnswers => {
  try {
    const parsed = JSON.parse(storage?.getItem(storageKey(experienceId)) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v === "run" || v === "skip")) as GuardAnswers;
  } catch {
    return {};
  }
};

/** Keep the answers for the sources there are now (older versions' answers go) */
export const writeAnswers = (experienceId: string, sources: readonly GuardSource[], answers: GuardAnswers, storage: Storage | null = safeStorage()): void => {
  const kept = Object.fromEntries(sources.map(answerKey).filter(key => answers[key]).map(key => [key, answers[key]]));
  try {
    storage?.setItem(storageKey(experienceId), JSON.stringify(kept));
  } catch {
    // no storage: the guard asks again next time
  }
};

/** Why a plugin kept off the stage did not run – the Code tab's status and the Log tab's line */
export const declinedReason = (source: GuardSource): string =>
  `${source.kind === "declared" ? "it came with the imported content, nobody here saved it" : `${whoName(source.savedBy)} saved it last`} and you chose Don't run – Run in the Code tab runs it now`;

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
