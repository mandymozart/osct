import {
  ErrorInfo,
  IGame,
  Pages,
  RouteParam,
  PageRoute,
  IRouterManager,
} from "../../../types";
import { BrowserHistoryManager, RouteResolver } from "./helpers";

/**
 * Manages routing and navigation
 */
export class RouterManager implements IRouterManager {
  private game: IGame;
  private historyManager: BrowserHistoryManager;

  constructor(game: IGame) {
    this.game = game;
    this.historyManager = new BrowserHistoryManager(game);
    
    // Handle the initial URL when the application starts
    this.historyManager.handleInitialUrl();
  }

  /**
   * Navigate to a different page
   * @param to Pages enum or string of url slug
   * @param params Optional route parameters
   */
  public navigate(to: Pages | string, params?: RouteParam[]): void {
    // Create a route object from the input
    const route = RouteResolver.createRoute(to, params);
    
    // Don't navigate if we're already on this page
    if (
      this.game.state.currentRoute && 
      RouteResolver.isSameRoute(route, this.game.state.currentRoute)
    ) {
      return;
    }

    // Check if route exists in configuration
    if (RouteResolver.routeExists(route)) {
      // Update browser URL
      this.historyManager.pushState(route);
      
      // Update application state
      this.game.set({ currentRoute: route });
    } else {
      // Handle 404 for unknown routes
      const notFoundRoute = { page: Pages.NOT_FOUND } as PageRoute;
      this.historyManager.pushState(notFoundRoute);
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
    this.navigate(Pages.ERROR, [{ key: "message", value: error.msg }]);
  }

  /**
   * Close overlay pages
   */
  public close(): void {
    this.game.set({ currentRoute: null });
  }
}
