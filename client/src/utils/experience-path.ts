/**
 * Which experience the reader opens (#87): one installation serves several experiences, each with its own content store
 * below the environment's CDN URL (`VITE_CONTENT_BASE_URL` = `<pull zone>/<title>/<env>`, docs/content-cdn.md).
 *
 *   /scene/<id>, /entry/<id>, …              the instance's default experience (`VITE_EXPERIENCE`) – links stay as they are
 *   /x/<experience>/scene/<id>, …            another experience: the same routes below `/x/<experience>`
 *
 * The experience is a path prefix, not a query parameter: the address bar keeps it across every route the app writes
 * (`LinkService` adds the prefix to each link), a shared or bookmarked link opens the same experience, a reload keeps
 * it, and the server already answers every path with index.html. A query parameter would be dropped by each link the
 * app writes (`?osct=<version>`) unless every one carried it too, and is easier to lose when a link is copied.
 * `/x/<default>/…` is the default experience as well; the app writes it without the prefix. Progress is kept per
 * experience id already (`osct-progress:<experienceId>`, ProgressStorage), so experiences never share it.
 */
import { EXPERIENCE_NAME, experienceBaseUrl } from "@shared/api/content-store";

/** The path segment before an experience id */
export const EXPERIENCE_SEGMENT = "x";

/** A path split into the experience it names (null = none) and the route path below it (`/` for the start) */
export interface ExperiencePath {
  experience: string | null;
  path: string;
}

/** `/x/demo/scene/s2` → { experience: "demo", path: "/scene/s2" }; a path without the prefix (or with a bad id) is the route itself */
export const splitExperiencePath = (pathname: string): ExperiencePath => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== EXPERIENCE_SEGMENT || segments.length < 2) return { experience: null, path: pathname };
  let experience: string;
  try {
    experience = decodeURIComponent(segments[1]);
  } catch {
    return { experience: null, path: pathname };
  }
  if (!EXPERIENCE_NAME.test(experience)) return { experience: null, path: pathname };
  return { experience, path: `/${segments.slice(2).join("/")}` };
};

/** The instance's default experience (`VITE_EXPERIENCE`), null when the build names none */
export const defaultExperience = (configured = import.meta.env.VITE_EXPERIENCE): string | null => configured?.trim() || null;

/** The experience the address names, else the default; null when neither (a build with bundled content) */
export const activeExperience = (
  pathname = typeof location === "undefined" ? "/" : location.pathname,
  fallback = defaultExperience(),
): string | null => splitExperiencePath(pathname).experience ?? fallback;

/** The prefix the app writes before every route path: `/x/<experience>` for another experience than the default, else "" */
export const experiencePrefix = (
  experience: string | null = activeExperience(),
  fallback = defaultExperience(),
): string => (experience && experience !== fallback ? `/${EXPERIENCE_SEGMENT}/${encodeURIComponent(experience)}` : "");

/**
 * The content base URL of the experience: the environment's (`VITE_CONTENT_BASE_URL`) + the experience; "" without an
 * environment base (bundled content) or without an experience
 */
export const contentBaseUrl = (
  environmentBase = import.meta.env.VITE_CONTENT_BASE_URL ?? "",
  experience: string | null = activeExperience(),
): string => (environmentBase && experience ? experienceBaseUrl(environmentBase, experience) : "");
