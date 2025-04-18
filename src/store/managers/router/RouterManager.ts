import {
  ErrorInfo,
  IGame,
  Pages,
  RouteParam,
  PageRoute,
  IRouterManager,
  GameMode,
} from "@/types";
import { RouteResolver } from "./helpers";

/**
 * Manages routing and navigation.
 * Currently only handles in-game navigation.
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
    const route = RouteResolver.createRoute(to, param);
    if (
      !force && 
      this.game.state.currentRoute && 
      RouteResolver.isSameRoute(route, this.game.state.currentRoute)
    ) {
      return;
    }

    // Check if route exists in configuration
    if (RouteResolver.routeExists(route)) {
      this.game.set({ currentRoute: route });
    } else {
      console.error(`[RouterManager] Route not found, showing 404`);
      const notFoundRoute = { page: Pages.NOT_FOUND, slug: "/not-found" } as PageRoute;
      this.game.set({ currentRoute: notFoundRoute });
    }
  }

  /**
   * Show error page with error details
   * @param error Error information to display
   * @param force Force navigation even if already on the error page
   */
  public showError(error: ErrorInfo, force: boolean = false): void {
    console.error('[RouterManager] Showing error:', error);
    
    // Store the error in router state
    this.game.set({ 
      currentRoute: { 
        page: Pages.ERROR, 
        slug: "/error" 
      },
      currentError: error
    });
  }

  /**
   * Close overlay pages
   */
  public close(): void {
    this.game.set({ 
      mode: GameMode.DEFAULT,
      currentRoute: null,
      currentError: null
    });
  }
}
