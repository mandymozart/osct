import { IGame, Pages, PageRoute, Route, SlugRoute } from "../../../../types";
import { RouteResolver } from "./RouteResolver";
import { UrlParser } from "./UrlParser";

/**
 * Helper class for managing browser history
 */
export class BrowserHistoryManager {
  private game: IGame;

  constructor(game: IGame) {
    this.game = game;
    this.setupHistoryNavigation();
  }

  /**
   * Push a new state to the browser history
   * @param route Route to push
   */
  public pushState(route: Route): void {
    const url = RouteResolver.getUrlForRoute(route);
    
    window.history.pushState(
      null, // Use null instead of complex object to avoid type issues
      '', 
      url
    );
  }

  /**
   * Replace the current state in the browser history
   * @param route Route to replace with
   */
  public replaceState(route: Route): void {
    const url = RouteResolver.getUrlForRoute(route);
    
    window.history.replaceState(
      null,
      '',
      url
    );
  }

  /**
   * Handle the initial URL when the application starts
   */
  public handleInitialUrl(): void {
    // Get the current URL path
    const path = UrlParser.getCurrentPath();
    
    // Skip for root path, let the default navigation handle it
    if (path === '/' || path === '') {
      return;
    }
    
    // Find a route for the current path
    const route = RouteResolver.findRouteByPath(path);
    
    if (route) {
      // Add query parameters to the route
      const params = UrlParser.getQueryParams();
      
      if ("page" in route) {
        this.game.set({ 
          currentRoute: { 
            page: route.page,
            params
          } as PageRoute 
        });
      } else if ("slug" in route) {
        this.game.set({ 
          currentRoute: { 
            slug: route.slug,
            params
          } as SlugRoute 
        });
      }
    } else {
      // Handle 404 for unknown routes
      this.game.set({ currentRoute: { page: Pages.NOT_FOUND } as PageRoute });
    }
  }

  /**
   * Set up browser history navigation to work with the router
   */
  private setupHistoryNavigation(): void {
    // Handle browser back/forward navigation
    window.addEventListener('popstate', () => {
      // Get the current URL path
      const path = UrlParser.getCurrentPath();
      
      // Find a route for the current path
      const route = RouteResolver.findRouteByPath(path);
      
      if (route) {
        // Add query parameters to the route
        const params = UrlParser.getQueryParams();
        
        if ("page" in route) {
          this.game.set({ 
            currentRoute: { 
              page: route.page,
              params
            } as PageRoute 
          });
        } else if ("slug" in route) {
          this.game.set({ 
            currentRoute: { 
              slug: route.slug,
              params
            } as SlugRoute 
          });
        }
      } else {
        // Handle 404 for unknown routes
        this.game.set({ currentRoute: { page: Pages.NOT_FOUND } as PageRoute });
      }
    });
  }
}
