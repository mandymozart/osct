import { RouteParam } from "../../../../types";

/**
 * Helper class for parsing URLs and extracting route parameters
 */
export class UrlParser {
  /**
   * Extract query parameters from a URL search string
   * @param search URL search string (e.g., "?key=value&key2=value2")
   * @returns Array of route parameters or undefined if no parameters
   */
  public static getQueryParams(search?: string): RouteParam[] | undefined {
    const searchString = search || window.location.search;
    const searchParams = new URLSearchParams(searchString);
    const params: RouteParam[] = [];
    
    searchParams.forEach((value, key) => {
      params.push({ key, value });
    });
    
    return params.length > 0 ? params : undefined;
  }

  /**
   * Get the current path from the window location
   * @returns The current path
   */
  public static getCurrentPath(): string {
    return window.location.pathname;
  }

  /**
   * Build a URL with query parameters
   * @param basePath Base URL path
   * @param params Optional route parameters
   * @returns Complete URL with query parameters
   */
  public static buildUrl(basePath: string, params?: RouteParam[]): string {
    let url = basePath;
    
    // Add params to URL if provided
    if (params && params.length > 0) {
      const queryParams = params
        .map(param => `${encodeURIComponent(param.key)}=${encodeURIComponent(param.value)}`)
        .join('&');
      url = `${url}${url.includes('?') ? '&' : '?'}${queryParams}`;
    }
    
    return url;
  }
}
