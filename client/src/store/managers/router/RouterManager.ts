import {
  ErrorInfo,
  GameState,
  IGame,
  Pages,
  RouteParam,
  PageRoute,
  IRouterManager,
} from "@/types";
import { Draft } from "immer";
import { RouteResolver } from "./helpers";

/**
 * Manages routing and navigation.
 * Currently only handles in-game navigation.
 *
 * Views = routes, modes = global app state. Every route declares its mode (`router.ts`);
 * navigating sets route and mode in one store update, so subscribers (scene bridge,
 * navigation bar) never see an inconsistent in-between state. Components never set the
 * mode themselves (RULES #2).
 */
export class RouterManager implements IRouterManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
  }

  /**
   * Navigate to a route
   * @param to Path or page to navigate to
   * @param param Optional parameter for the route
   * @param force Force navigation even if already on the route
   */
  public navigate(to: string | Pages, param?: RouteParam, force: boolean = false): void {
    this.go(to, param, force);
  }

  /**
   * Show error page with error details
   * @param error Error information to display
   * @param force Force navigation even if already on the error page
   */
  public showError(error: ErrorInfo, force: boolean = false): void {
    console.error('[RouterManager] Showing error:', error);

    // Error is an overlay route: the mode stays as it is
    this.game.update(draft => {
      draft.currentRoute = {
        page: Pages.ERROR,
        slug: "/error"
      };
      draft.currentError = error;
    });
  }

  /**
   * Close overlay pages: back to the scan HUD (scan mode), error cleared
   */
  public close(): void {
    this.go("/spread", undefined, true, draft => {
      draft.currentError = null;
    });
  }

  /**
   * Apply route + mode (+ optional extra changes) in one update.
   * Unknown slugs show the not-found overlay and keep the current mode.
   */
  private go(
    to: string,
    param: RouteParam | undefined,
    force: boolean,
    extra?: (draft: Draft<GameState>) => void
  ): void {
    const definition = RouteResolver.findDefinition(to);

    if (!definition) {
      console.error(`[RouterManager] Route not found: ${to}, showing 404`);
      this.game.update(draft => {
        draft.currentRoute = { page: Pages.NOT_FOUND, slug: "/not-found" };
        extra?.(draft);
      });
      return;
    }

    const route: PageRoute = { page: definition.page, slug: definition.slug, param };
    const current = this.game.state.currentRoute;
    if (!force && current && RouteResolver.isSameRoute(route, current)) {
      return;
    }

    this.game.update(draft => {
      draft.currentRoute = route;
      if (definition.mode) {
        draft.mode = definition.mode;
      }
      extra?.(draft);
    });
  }
}
