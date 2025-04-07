import { Pages, PageRoute, Route, RouteParam, SlugRoute } from "../../../../types";
import { router as routerConfig } from "../../../../router";
import { assert } from "../../../../utils/assert";
import { UrlParser } from "./UrlParser";

/**
 * Helper class for resolving routes from different inputs
 */
export class RouteResolver {
  /**
   * Create a route object from a page or slug
   * @param to Pages enum or string of url slug
   * @param params Optional route parameters
   * @returns Route object
   */
  public static createRoute(to: Pages | string, params?: RouteParam[]): Route {
    if (typeof to === "string" && to.startsWith("/")) {
      // Handle as slug route
      return {
        slug: to,
        params,
      } as SlugRoute;
    } else {
      // Handle as page route
      const page =
        typeof to === "string"
          ? Object.values(Pages).find(
              (p) => p.toLowerCase() === to.toLowerCase()
            ) || Pages.NOT_FOUND
          : to;

      return {
        page,
        params,
      } as PageRoute;
    }
  }

  /**
   * Find a route in the configuration by page
   * @param page Page to find
   * @returns Matching route or undefined
   */
  public static findRouteByPage(page: Pages): Route | undefined {
    const configRoute = routerConfig.routes.find(
      (r) => "page" in r && r.page === page
    );
    
    return configRoute;
  }

  /**
   * Find a route in the configuration by slug
   * @param slug Slug to find
   * @returns Matching route or undefined
   */
  public static findRouteBySlug(slug: string): Route | undefined {
    const configRoute = routerConfig.routes.find(
      (r) => "slug" in r && r.slug === slug
    );
    
    return configRoute;
  }

  /**
   * Find a route in the configuration by path
   * @param path URL path to find
   * @returns Matching route or undefined
   */
  public static findRouteByPath(path: string): Route | undefined {
    // First try to find a matching slug route
    const slugRoute = this.findRouteBySlug(path);
    if (slugRoute) {
      return slugRoute;
    }
    
    // If no matching slug route, check if the path matches a page name
    const pageName = path.substring(1); // Remove leading slash
    const page = Object.values(Pages).find(
      (p) => p.toLowerCase() === pageName.toLowerCase()
    );
    
    if (page) {
      return { page } as PageRoute;
    }
    
    return undefined;
  }

  /**
   * Get the URL for a route
   * @param route Route object
   * @returns URL string
   */
  public static getUrlForRoute(route: Route): string {
    if ("slug" in route) {
      return UrlParser.buildUrl(route.slug, route.params);
    } else if ("page" in route) {
      // Find the corresponding slug for this page in the router config
      const configRoute = this.findRouteByPage(route.page);
      
      const basePath = configRoute && "slug" in configRoute 
        ? configRoute.slug 
        : `/${route.page.toLowerCase()}`; // Fallback to lowercase page name
        
      return UrlParser.buildUrl(basePath, route.params);
    }
    
    assert(false, "Invalid route object");
    return "/"; // This line should never be reached due to the assertion
  }

  /**
   * Check if a route exists in the configuration
   * @param route Route to check
   * @returns True if the route exists
   */
  public static routeExists(route: Route): boolean {
    return routerConfig.routes.some(
      (r) =>
        ("page" in route && "page" in r && r.page === route.page) ||
        ("slug" in route && "slug" in r && r.slug === route.slug)
    );
  }

  /**
   * Check if two routes are the same
   * @param routeA First route
   * @param routeB Second route
   * @returns True if the routes are the same
   */
  public static isSameRoute(routeA: Route | null, routeB: Route | null): boolean {
    if (!routeA || !routeB) {
      return false;
    }
    
    if ("page" in routeA && "page" in routeB) {
      return routeA.page === routeB.page;
    }
    
    if ("slug" in routeA && "slug" in routeB) {
      return routeA.slug === routeB.slug;
    }
    
    return false;
  }
}
