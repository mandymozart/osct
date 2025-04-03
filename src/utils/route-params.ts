import { RouteParam } from "../store/types";

/**
 * Parse route parameters from an HTML element
 * @param element Element with route-params attribute
 * @returns Parsed route parameters object or null if invalid
 */
export function parseRouteParams(element: HTMLElement): RouteParam[] | null {
  const routeParamsAttr = element.getAttribute('route-params');
  
  if (!routeParamsAttr) {
    return null;
  }
  
  try {
    return JSON.parse(routeParamsAttr) as RouteParam[];
  } catch (error) {
    console.error('[RouteParams] Error parsing route params:', error);
    return null;
  }
}

/**
 * Get a specific parameter value from route parameters
 * @param params Route parameters array
 * @param key Parameter key to look for
 * @returns The parameter value or undefined if not found
 */
export function getParamValue<T>(params: RouteParam[] | null, key: string): T | undefined {
  if (!params) return undefined;
  
  const param = params.find(p => p.key === key);
  return param?.value as T | undefined;
}

/**
 * Get multiple parameter values at once as an object
 * @param element Element with route-params attribute
 * @param keys Array of parameter keys to extract
 * @returns Object with keys mapping to their parameter values
 */
export function getParams<T>(element: HTMLElement, keys: string[]): Record<string, T | undefined> {
  const params = parseRouteParams(element);
  const result: Record<string, T | undefined> = {};
  
  keys.forEach(key => {
    result[key] = getParamValue<T>(params, key);
  });
  
  return result;
}

/**
 * Get a single parameter value directly from an element
 * @param element Element with route-params attribute
 * @param key Parameter key to extract
 * @returns The parameter value or undefined if not found
 */
export function getParam<T>(element: HTMLElement, key: string): T | undefined {
  const params = parseRouteParams(element);
  return getParamValue<T>(params, key);
}