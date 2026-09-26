import { router } from "@/router";
import { GameState, IGame, PageRoute, Pages } from "@/types";
import { parseVersion } from "@/utils";
import { getEntry, getSpread, getTutorial } from "@/utils/game-config";
import { isEntryCategory } from "@shared/guards/game-config";

/**
 * Links = app state as a plain URL (PLAN Phase 2 "deep links", Tilman 2026-09-26):
 *
 *   /                          start (onboarding on a first visit, else home)
 *   /spread/<spreadId>         scan mode on that spread
 *   /entries/<category>        entries list (also /entries/category/<category>)
 *   /entry/<entryId>           one entry
 *   /tutorial/<step>           onboarding step
 *   /about                     info
 *   …?osct=<version>           the app version the link was made with
 *
 * Incoming links only route: an unknown route, spread, entry, category or step shows the not-found
 * page (with "Go to start"). Version: only a link made with a *newer* app needs an action (reload to
 * update); older links just route. Legacy printed codes `/?code=c-<spread>` (and `s-` / `e-`) still work.
 *
 * While the app runs, the URL follows the state (`LinkService.startSync`): a new view pushes a history entry, a
 * spread switch or tutorial step replaces it, and the browser's back button goes back through the views.
 * Overlays (error, not-found) keep the URL. The server must answer every path with `index.html`
 * (`public/.htaccess` for Apache, `public/_redirects` for Netlify; Vite does it in dev and preview).
 */

export const VERSION_PARAM = "osct";

/** A parsed link: route slug + its parameter value, and the version it was made with */
export interface Link {
  slug: string;
  value?: string;
  version?: string;
}

const LEGACY_CODE = /^([cse])-(.+)$/;

/** URL path + query → link; null for the start page ("/" without a legacy code) */
export const parseLink = (pathname: string, search: string): Link | null => {
  const params = new URLSearchParams(search);
  const version = params.get(VERSION_PARAM) ?? undefined;
  const segments = pathname.split("/").filter(Boolean).map(s => decodeURIComponent(s));

  if (segments.length === 0) {
    const legacy = LEGACY_CODE.exec(params.get("code") ?? "");
    if (!legacy) return null;
    return { slug: legacy[1] === "e" ? "/entry" : "/spread", value: legacy[2], version };
  }

  const slug = `/${segments[0]}`;
  const definition = router.routes.find(r => r.slug === slug);
  // "/entries/video" and "/entries/category/video" both work
  if (segments.length === 3 && definition?.param === segments[1]) return { slug, value: segments[2], version };
  if (segments.length <= 2) return { slug, value: segments[1], version };
  return { slug: pathname, version }; // too many segments: not found
};

/** Path of a route (+ the active spread for scan mode) – what the address bar shows */
export const pathForRoute = (route: PageRoute | null, currentSpread: string | null): string | null => {
  if (!route) return null;
  const segment = (value: string | number | undefined) => (value === undefined ? "" : `/${encodeURIComponent(String(value))}`);
  switch (route.page) {
    case Pages.HOME:
      return "/";
    case Pages.SPREAD:
      return `/spread${segment(currentSpread ?? undefined)}`;
    case Pages.ERROR:
    case Pages.NOT_FOUND:
      return null; // overlays keep the URL
    default:
      return `${route.slug}${segment(route.param?.value)}`;
  }
};

/** Full link (path + version) for the current state */
export const linkForState = (state: Pick<GameState, "currentRoute" | "currentSpread">, version: string): string | null => {
  const path = pathForRoute(state.currentRoute, state.currentSpread);
  return path === null ? null : `${path}?${VERSION_PARAM}=${encodeURIComponent(version)}`;
};

/** True when `linkVersion` is newer than the running app (the link needs an updated app) */
export const isNewerVersion = (linkVersion: string | undefined, appVersion: string): boolean => {
  const link = linkVersion ? parseVersion(linkVersion) : null;
  const app = parseVersion(appVersion);
  if (!link || !app) return false;
  if (link.major !== app.major) return link.major > app.major;
  if (link.minor !== app.minor) return link.minor > app.minor;
  return link.patch > app.patch;
};

/**
 * Route to a link's state. Returns false (and shows the not-found page) when the route or its target
 * doesn't exist. `checkVersion` (incoming links, not back/forward) asks for a reload when the link was
 * made with a newer app.
 */
export const resolveLink = (game: IGame, link: Link, checkVersion = true): boolean => {
  if (checkVersion && isNewerVersion(link.version, game.version.version)) {
    game.notifyError({
      code: "link-newer-version",
      msg: `This link was made with a newer version of the app (${link.version}). Reload to update.`,
      type: "info",
      action: { text: "Reload", callback: () => window.location.reload() },
    });
    return false;
  }

  const { slug, value } = link;
  const notFound = () => {
    game.router.navigate("/not-found");
    return false;
  };

  switch (slug) {
    case "/":
    case "/about":
      if (value !== undefined) return notFound();
      game.router.navigate(slug);
      return true;
    case "/spread":
      if (value !== undefined) {
        if (!getSpread(value)) return notFound();
        game.spreads.switchSpread(value);
      }
      game.router.navigate("/spread");
      return true;
    case "/entries":
      if (value !== undefined && !isEntryCategory(value)) return notFound();
      game.router.navigate("/entries", value === undefined ? undefined : { key: "category", value });
      return true;
    case "/entry":
      if (value === undefined || !getEntry(value)) return notFound();
      game.router.navigate("/entry", { key: "entryId", value });
      return true;
    case "/tutorial": {
      const step = value === undefined ? 0 : Number(value);
      if (!Number.isInteger(step) || step < 0 || step >= getTutorial().length) return notFound();
      game.router.navigate("/tutorial", { key: "step", value: String(step) });
      return true;
    }
    default:
      return notFound();
  }
};

/**
 * The browser side of links (singleton): opens the link the app was started with and keeps the address
 * bar in sync with the state afterwards.
 */
export class LinkService {
  private static instance: LinkService | null = null;
  private cleanup: (() => void) | null = null;

  static getInstance(): LinkService {
    if (!LinkService.instance) LinkService.instance = new LinkService();
    return LinkService.instance;
  }

  /** The link in the address bar, if any (null = plain start) */
  currentLink(): Link | null {
    return parseLink(window.location.pathname, window.location.search);
  }

  /** Route to the link the app was opened with. False when there is none – the normal start follows. */
  openIncomingLink(game: IGame): boolean {
    const link = this.currentLink();
    if (!link) return false;
    resolveLink(game, link);
    return true;
  }

  /**
   * Keep the URL in sync with the state and follow the browser's back / forward buttons.
   * Start after the incoming link was opened (else the start page would overwrite it).
   */
  startSync(game: IGame): void {
    this.stopSync();
    let lastPage: Pages | null = null;
    let lastParam: string | undefined;

    const write = () => {
      const { currentRoute } = game.state;
      const link = linkForState(game.state, game.version.version);
      if (!link || !currentRoute) return;
      const param = currentRoute.param === undefined ? undefined : String(currentRoute.param.value);
      // A new view (or another entry) gets its own history entry; spread / step changes replace it
      const push = lastPage !== null && (currentRoute.page !== lastPage || (currentRoute.page === Pages.ENTRY && param !== lastParam));
      lastPage = currentRoute.page;
      lastParam = param;
      if (link === `${window.location.pathname}${window.location.search}`) return;
      if (push) window.history.pushState(null, "", link);
      else window.history.replaceState(null, "", link);
    };

    const onPopState = () => {
      const link = this.currentLink();
      if (link) resolveLink(game, link, false);
      else game.router.navigate("/");
    };

    const cleanups = [
      game.subscribeToProperty("currentRoute", write),
      game.subscribeToProperty("currentSpread", write),
    ];
    window.addEventListener("popstate", onPopState);
    write();
    this.cleanup = () => {
      cleanups.forEach(cleanup => cleanup());
      window.removeEventListener("popstate", onPopState);
    };
  }

  stopSync(): void {
    this.cleanup?.();
    this.cleanup = null;
  }
}
