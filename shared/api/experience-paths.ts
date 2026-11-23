/**
 * Every experience at its own path (#343, docs/content-cdn.md "Which experience the reader opens"): the reader of an
 * instance answers `/<experience>/…` – `/osct/`, `/osct/scene/s1`, `/demo/entry/…` –, and the experience's id is that
 * path segment, its slug, and the folder of its content store (`<title>/<env>/<experience>/`, content-store.ts). One
 * identifier: a new experience's id is chosen once, as its slug, and never changes once it is published – printed QR
 * codes depend on it.
 *
 * Here: which ids an experience may not have (the app's own top-level paths), the slug rule for new experiences, and
 * the map from an arrival's source (`?s=`, #324) to the experience a code without one opens – the printed book's code
 * is `https://osct.buildingfictions.com/?s=bk1` and must open `/osct/` forever (RULES #39).
 * The PHP API copies `RESERVED_PATHS` and `EXPERIENCE_SLUG` (`Experiences::RESERVED`, `Experiences::SLUG`);
 * `mcp/test/php-rules.test.ts` fails on a difference. Not content: `shared/api/` is outside the content schema lock.
 */

/**
 * Top-level paths of the site that are not an experience: the app's own routes (a legacy link `/scene/<id>` without an
 * experience is told apart by them), the editor and the API, the documentation site, the built files, the service
 * worker, the manifest and icons, the dev server's own paths and a few kept free for later. Compared lower-case.
 */
export const RESERVED_PATHS = [
  // the reader's routes (client/src/router.ts) and their older or planned names
  "scene", "scenes", "entry", "entries", "tutorial", "about", "info", "credits", "error", "not-found", "splash", "settings",
  "login", "logout", "account", "start", "home", "index",
  // the old prefix of another experience (#87: /x/<experience>/ – redirected to /<experience>/)
  "x",
  // the instance's other apps and files
  "editor", "admin", "api", "docs", "mcp", "assets", "vendor", "_app", "static", "public", "content",
  "manifest", "manifest.webmanifest", "service-worker", "service-worker.js", "sw", "sw.js", "registersw.js", "workbox",
  "robots.txt", "favicon.ico", "index.html", "icons", "fonts",
  // the static pages beside the app (Privacy & terms, #355 – privacy.html, answered for /privacy and /<experience>/privacy)
  "privacy", "privacy.html",
  // the dev server's (Vite) own paths
  "src", "node_modules", "@vite", "@fs", "@id",
  // kept free
  "app", "www", "help", "status", "health", "well-known", ".well-known",
] as const;

/** Whether a path segment is one of the site's own (`RESERVED_PATHS`, any case) – never an experience */
export const isReservedPath = (segment: string): boolean =>
  (RESERVED_PATHS as readonly string[]).includes(segment.toLowerCase()) || segment.toLowerCase().startsWith("workbox-");

/**
 * A new experience's slug – its id, its path `/<slug>/` and its store's folder: lower-case letters, digits and dashes,
 * a letter or digit first, at most 64 (`Experiences::SLUG`). Experiences imported before #343 may have ids of the wider
 * id rule (`ID_PATTERN`: capitals, `_`) – the reader opens those too.
 */
export const EXPERIENCE_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Why a slug cannot be a new experience's (null: it can) – the editor's form and the MCP say it before the API does */
export const slugProblem = (slug: string): string | null => {
  if (!slug) return "Give the experience a slug.";
  if (!EXPERIENCE_SLUG.test(slug)) return "A slug is lower-case letters, digits and dashes (a letter or digit first, at most 64).";
  if (isReservedPath(slug)) return `“${slug}” is one of the site's own paths – choose another slug.`;
  return null;
};

/** A slug proposed from a title: lower-case, accents dropped, every other run of characters a dash ("Onion Skin" → "onion-skin") */
export const slugFromTitle = (title: string): string =>
  title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "");

/**
 * Which experience an arrival's source opens when its address names none (a code printed before #343): the first rule
 * that matches. `bk1` (the printed book, `https://osct.buildingfictions.com/?s=bk1`) → `osct` – forever (RULES #39);
 * `d1` (the demo's code) → `demo`. A source no rule names opens the instance's default experience.
 */
export const SOURCE_EXPERIENCES: ReadonlyArray<{ source: RegExp; experience: string }> = [
  { source: /^bk\d*$/, experience: "osct" },
  { source: /^d\d+$/, experience: "demo" },
];

/** The experience a legacy code's source opens, null when no rule names it (the default experience then) */
export const experienceOfSource = (source: string | null | undefined): string | null => {
  if (!source) return null;
  const clean = source.trim().toLowerCase();
  return SOURCE_EXPERIENCES.find(rule => rule.source.test(clean))?.experience ?? null;
};

/** The reader's path of a route in an experience: `/<experience>/` for the start, `/<experience>/scene/s1` for a route */
export const readerPath = (experience: string, route = "/"): string => {
  const path = route.startsWith("/") ? route : `/${route}`;
  return `/${encodeURIComponent(experience)}${path}`;
};
