/**
 * Which experience the reader opens (#87, #343): one installation serves several experiences, each at its own path and
 * with its own content store below the environment's CDN URL (`VITE_CONTENT_BASE_URL` = `<pull zone>/<title>/<env>`,
 * docs/content-cdn.md):
 *
 *   /osct/, /osct/scene/<id>, /osct/entry/<id>, …     the experience `osct` – every route below `/<experience>`
 *   /demo/, /demo/scene/<id>, …                       the experience `demo`
 *
 * The experience is the first path segment unless it is one of the site's own paths (`RESERVED_PATHS`,
 * shared/api/experience-paths.ts – `scene`, `entry`, `editor`, `api`, …). The address bar keeps it across every route
 * the app writes (`LinkService` adds the prefix to each link), a shared or bookmarked link opens the same experience,
 * a reload keeps it, and the server answers every path with index.html. Progress is kept per experience id
 * (`osct-progress:<experienceId>`, ProgressStorage), so experiences never share it.
 *
 * An address without an experience – every code and link made before #343 – is moved to one before anything loads
 * (`redirectLegacyAddress`, called first in main.ts): `/x/<experience>/…` → `/<experience>/…`; `/?s=bk1` → `/osct/`,
 * `/?s=d1` → `/demo/` (the source's experience, `SOURCE_EXPERIENCES`; the source stays in the address for the arrival
 * count, which takes it out after); `/` → the experience this browser opened last (the installed app starts at `/`),
 * else the default; any other route (`/scene/<id>`, `/entry/<id>`, `/about`, with or without `?osct=`) → the same route
 * of the instance's default experience (`VITE_EXPERIENCE`).
 */
import { EXPERIENCE_NAME, experienceBaseUrl } from "@shared/api/content-store";
import { experienceOfSource, isReservedPath } from "@shared/api/experience-paths";

/** The path segment of the old prefix (#87: `/x/<experience>/…`) – redirected to `/<experience>/…` */
export const LEGACY_SEGMENT = "x";
/** Where this browser keeps the experience it opened last (the installed app's `/` opens it) */
export const LAST_EXPERIENCE_KEY = "osct-experience";
/** The arrival's source parameter (`ArrivalService.SOURCE_PARAM`, here too so this module loads nothing else) */
const SOURCE_PARAM = "s";

/** A path split into the experience it names (null = none) and the route path below it (`/` for the start) */
export interface ExperiencePath {
  experience: string | null;
  path: string;
}

const decoded = (segment: string): string | null => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

/** Whether a path segment names an experience: an id, and not one of the site's own paths */
const isExperienceSegment = (segment: string | null): segment is string =>
  segment !== null && EXPERIENCE_NAME.test(segment) && !isReservedPath(segment);

/**
 * `/demo/scene/s2` → { experience: "demo", path: "/scene/s2" }; a path whose first segment is no experience (a route
 * of the app – `/scene/s2` –, a reserved path, a bad id) has none: the path is the route itself
 */
export const splitExperiencePath = (pathname: string): ExperiencePath => {
  const segments = pathname.split("/").filter(Boolean);
  const experience = segments.length ? decoded(segments[0]) : null;
  if (!isExperienceSegment(experience)) return { experience: null, path: pathname };
  return { experience, path: `/${segments.slice(1).join("/")}` };
};

/** The instance's default experience (`VITE_EXPERIENCE`), null when the build names none */
export const defaultExperience = (configured = import.meta.env.VITE_EXPERIENCE): string | null => configured?.trim() || null;

/** The experience the address names, else the default; null when neither (a build with bundled content) */
export const activeExperience = (
  pathname = typeof location === "undefined" ? "/" : location.pathname,
  fallback = defaultExperience(),
): string | null => splitExperiencePath(pathname).experience ?? fallback;

/** The prefix the app writes before every route path: `/<experience>`; "" without an experience (bundled content) */
export const experiencePrefix = (experience: string | null = activeExperience()): string =>
  experience ? `/${encodeURIComponent(experience)}` : "";

/**
 * The content base URL of the experience: the environment's (`VITE_CONTENT_BASE_URL`) + the experience; "" without an
 * environment base (bundled content) or without an experience
 */
export const contentBaseUrl = (
  environmentBase = import.meta.env.VITE_CONTENT_BASE_URL ?? "",
  experience: string | null = activeExperience(),
): string => (environmentBase && experience ? experienceBaseUrl(environmentBase, experience) : "");

/**
 * Where an address without an experience goes (#343): the same route, query and hash below `/<experience>`; null when
 * the address names an experience already, or when no experience is known (a build with bundled content and no
 * `VITE_EXPERIENCE` – the address stays as it is).
 *
 *   /x/demo/scene/s1?osct=6.0.0   → /demo/scene/s1?osct=6.0.0      the old prefix
 *   /?s=bk1                       → /osct/?s=bk1                   the source's experience (SOURCE_EXPERIENCES)
 *   /                             → /<last opened>/ or /<default>/
 *   /scene/s1, /entry/e, /about   → /<default>/scene/s1, …         (also with ?s=: the source's experience)
 */
export const legacyRedirect = (
  pathname: string,
  search: string,
  hash = "",
  options: { fallback?: string | null; last?: string | null } = {},
): string | null => {
  const fallback = options.fallback === undefined ? defaultExperience() : options.fallback;
  const segments = pathname.split("/").filter(Boolean);
  const first = segments.length ? decoded(segments[0]) : null;
  if (isExperienceSegment(first)) return null;
  const tail = `${search}${hash}`;
  // The old prefix: /x/<experience>/… → /<experience>/…
  if (first === LEGACY_SEGMENT && segments.length >= 2) {
    const named = decoded(segments[1]);
    if (isExperienceSegment(named)) return `/${encodeURIComponent(named)}/${segments.slice(2).join("/")}${tail}`;
  }
  const source = new URLSearchParams(search).get(SOURCE_PARAM);
  const last = options.last && isExperienceSegment(options.last) ? options.last : null;
  const experience = experienceOfSource(source) ?? (segments.length === 0 ? last : null) ?? fallback;
  if (!experience) return null;
  const route = segments.length === 0 ? "/" : pathname.replace(/^\/+/, "/");
  return `/${encodeURIComponent(experience)}${route}${tail}`;
};

const storage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** The experience this browser opened last (null: none, or storage is not available) */
export const lastExperience = (): string | null => {
  try {
    const stored = storage()?.getItem(LAST_EXPERIENCE_KEY) ?? null;
    return stored && isExperienceSegment(stored) ? stored : null;
  } catch {
    return null;
  }
};

/** Remembers the experience that opened (the installed app's `/` opens it next time); a storage failure is dropped */
export const rememberExperience = (experience: string | null): void => {
  if (!experience) return;
  try {
    storage()?.setItem(LAST_EXPERIENCE_KEY, experience);
  } catch {
    // private mode or blocked storage: the installed app's `/` opens the default experience
  }
};

/**
 * Moves an address without an experience to one (`legacyRedirect`) with `history.replaceState` – before anything reads
 * the address (main.ts, first). Returns the new address, or null when it stays.
 */
export const redirectLegacyAddress = (win: Window = window): string | null => {
  const { pathname, search, hash } = win.location;
  const target = legacyRedirect(pathname, search, hash, { last: lastExperience() });
  if (target === null) return null;
  win.history.replaceState(win.history.state, "", target);
  return target;
};
