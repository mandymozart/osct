import { PageRoute, RouteParam } from "@/types/router";
import { router as routerConfig } from "@/router";

/**
 * Helper class for resolving routes from different inputs
 */
export class RouteResolver {
  /**
   * Create a route object from a slug
   * @param to string of url slug
   * @param param Optional route parameters
   * @returns PageRoute object
   */
  public static createRoute(to: string, param?: RouteParam): PageRoute {
    const pageRoute = routerConfig.routes.find(r => r.slug === to);
    if (!pageRoute) {
      throw new Error(`Route not found: ${to}`);
    }
    return {
      page: pageRoute.page,
      slug: pageRoute.slug,
      param: param
    };
  }

  /**
   * Check if two routes are the same
   * @param r1 First route
   * @param r2 Second route
   * @returns True if routes are the same, false otherwise
   */
  public static isSameRoute(r1: PageRoute, r2: PageRoute): boolean {
    return r1.page === r2.page && r1.slug === r2.slug && r1.param === r2.param;
  }

  /**
   * Check if a route exists in the configuration
   * @param route Route to check
   * @returns True if route exists, false otherwise
   */
  public static routeExists(route: PageRoute): boolean {
    return routerConfig.routes.some(r => r.page === route.page);
  }

  /**
   * Get the URL for a route
   * @param route Route to get URL for
   * @returns URL string
   */
  public static getUrlForRoute(route: PageRoute): string {
    return `${route.slug}${route.param ? `/${route.param.value}` : ""}`
  }
}
