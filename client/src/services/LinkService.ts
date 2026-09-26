import { router } from "@/router";
import { GameState, IGame, PageRoute, Pages } from "@/types";
import { getEntry, getSpread, getTutorial } from "@/utils/game-config";
import { isEntryCategory } from "@shared/guards/game-config";

/**
 * Links = app state as a plain URL (PLAN Phase 2 "deep links", Tilman 2026-09-26):
 *
 *   /                          start (onboarding on a first visit, else the splash → scan mode)
 *   /spread/<spreadId>         scan mode on that spread
 *   /entries/<category>        entries list (also /entries/category/<category>)
 *   /entry/<entryId>           one entry
 *   /tutorial/<step>           onboarding step
 *   /about                     info
 *   …?osct=<version>           the app version the link was made with
 *
 * Incoming links only route. A link to an entry the reader hasn't consulted yet opens scan mode on the
 * spread of its access page (no shortcut past the game). An unknown route, spread, entry, category or step
 * shows the not-found page (with "Go to start"). The version in a link is informative only: links just
 * route (a stored progress record of another format is handled by the progress reader). Nothing from
 * before 1.1.0 is supported (no old `?code=` links – RULES #10).
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

/** URL path + query → link; null for the start page */
export const parseLink = (pathname: string, search: string): Link | null => {
  const params = new URLSearchParams(search);
  const version = params.get(VERSION_PARAM) ?? undefined;
  const segments = pathname.split("/").filter(Boolean).map(s => decodeURIComponent(s));

  if (segments.length === 0) return null;

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
    case Pages.SPLASH:
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

/**
 * Route to a link's state. Returns false (and shows the not-found page) when the route or its target
 * doesn't exist.
 */
export const resolveLink = (game: IGame, link: Link): boolean => {
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
    case "/entry": {
      const entry = value === undefined ? undefined : getEntry(value);
      if (!entry) return notFound();
      if (!game.history.isConsulted(entry.id)) {
        // Not found by the reader yet: no shortcut past the game – scan mode on the entry's page instead
        game.spreads.switchSpread(entry.spreadId);
        game.router.navigate("/spread");
        return true;
      }
      game.router.navigate("/entry", { key: "entryId", value: entry.id });
      return true;
    }
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
      // A new view (or another entry) gets its own history entry; spread / step changes replace it, and so
      // does leaving the splash (it only plays on the way in – back must not replay it)
      const push = lastPage !== null && lastPage !== Pages.SPLASH &&
        (currentRoute.page !== lastPage || (currentRoute.page === Pages.ENTRY && param !== lastParam));
      lastPage = currentRoute.page;
      lastParam = param;
      if (link === `${window.location.pathname}${window.location.search}`) return;
      if (push) window.history.pushState(null, "", link);
      else window.history.replaceState(null, "", link);
    };

    const onPopState = () => {
      const link = this.currentLink();
      if (link) resolveLink(game, link);
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
