import {
  ErrorInfo,
  IGame,
  Pages,
  RouteParam,
  PageRoute,
  IRouterManager,
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
   * Navigate to a different page
   * @param to Pages enum or string of url slug
   * @param param Optional route parameters
   */
  public navigate(to: string, param?: RouteParam): void {
    const route = RouteResolver.createRoute(to, param);
    if (
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
   */
  public showError(error: ErrorInfo): void {
    console.error(error);
    // Navigate to error page and pass error details as parameters
    this.navigate(Pages.ERROR, { key: "message", value: error.msg });
  }

  /**
   * Close overlay pages
   */
  public close(): void {
    this.game.set({ currentRoute: null });
  }
}
