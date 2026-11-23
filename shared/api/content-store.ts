/**
 * The content store's layout (#87, #50 – docs/content-cdn.md): one storage zone holds several titles (white-label
 * instances), each title its environments, each environment its experiences – every experience has a store of its own:
 *
 *   <title>/<env>/<experience>/latest.json           the current version of that experience there (ContentManifest)
 *   <title>/<env>/<experience>/versions.json         every version on the storage and when it was current
 *   <title>/<env>/<experience>/<build>/…             one immutable folder per content version
 *   <title>/<env>/<experience>/<build>/landing.json  what the desktop landing shows (landing.ts – written by publish, #355)
 *
 * `<title>/<env>/<experience>` is the store root (`storeRoot`). The title is a setting of the instance (`OSCT_TITLE`,
 * default `osct` – `Config::title()` on the server, the osct CLI's environment), never part of the content. A reader is
 * given the environment's URL (`VITE_CONTENT_BASE_URL` = `OSCT_CONTENT_BASE_URL` = `<pull zone>/<title>/<env>`, the
 * environment base) and adds the experience (`experienceBaseUrl`). The directory store on a server without a CDN
 * leaves the title out (one instance, one title): `<dir>/<env>/<experience>/…`, served as `/api/content/<env>/<experience>/…`.
 * The PHP side is `ContentStore` (server/api/src/ContentStore.php); `mcp/test/php-rules.test.ts` compares the rules.
 * Not content: `shared/api/` is outside the content schema lock (RULES #10).
 */
import { ENV_NAME, ID_PATTERN } from "./names";

/** The title when OSCT_TITLE is not set (`Config::DEFAULTS['TITLE']`) */
export const DEFAULT_TITLE = "osct";

/** A title's name: the rule of an environment's name (`ContentStore::ENV`) */
export const TITLE_NAME = ENV_NAME;

/** An experience id in the store's paths: the editor API's id rule (`Editor::ID`) */
export const EXPERIENCE_NAME = ID_PATTERN;

/** The store root of an experience in an environment on the storage zone: `<title>/<env>/<experience>` */
export const storeRoot = (title: string, env: string, experience: string): string => {
  if (!TITLE_NAME.test(title)) throw new Error(`"${title}" is no title name – lower-case letters, digits and -, a letter first, at most 32`);
  if (!ENV_NAME.test(env)) throw new Error(`"${env}" is no environment name – lower-case letters, digits and -, a letter first, at most 32`);
  if (!EXPERIENCE_NAME.test(experience)) throw new Error(`"${experience}" is no experience id – letters, digits, _ and -, at most 64`);
  return `${title}/${env}/${experience}`;
};

/** An experience's content base URL below an environment base URL (`<pull zone>/<title>/<env>` → `…/<experience>`) */
export const experienceBaseUrl = (environmentBase: string, experience: string): string =>
  `${environmentBase.replace(/\/+$/, "")}/${encodeURIComponent(experience)}`;
