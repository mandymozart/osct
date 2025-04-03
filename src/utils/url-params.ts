import { GameMode, Pages, Route, RouteParam } from "../store/types";
import { router } from "../router";

interface ParsedParams {
  page?: Pages;
  slug?: string;
  mode?: GameMode;
  params?: RouteParam[];
}

/**
 * Parse pathname to determine page/route
 */
const parsePathname = (pathname: string): Partial<ParsedParams> => {
  // Remove leading/trailing slashes and split
  const parts = pathname.replace(/^\/|\/$/g, "").split("/");

  // Find matching route from router configuration
  const route = router.routes.find((r) => {
    const routeParts = r.slug.replace(/^\/|\/$/g, "").split("/");
    return routeParts[0] === parts[0];
  });

  if (!route) {
    return {
      page: Pages.NOT_FOUND,
      slug: "/not-found",
    };
  }

  // Build params array if route has param definitions
  const params = route.params
    ?.map((param, index) => ({
      key: param.key,
      value: parts[index + 1] || "",
    }))
    .filter((p) => p.value !== "");

  return {
    page: route.page,
    slug: route.slug,
    params: params?.length ? params : undefined,
  };
};

/**
 * Parse search parameters for additional settings
 * * @param params URLSearchParams object
 * @returns Parsed parameters object
 */
const parseSearchParams = (params: URLSearchParams): Partial<ParsedParams> => {
  const result: Partial<ParsedParams> = {};

  // Handle mode parameter
  const mode = params.get("m") || params.get("mode");
  if (mode) {
    switch (mode.toLowerCase()) {
      case "qr":
        result.mode = GameMode.QR;
        break;
      case "vr":
        result.mode = GameMode.DEFAULT;
        break;
    }
  }

  return result;
};

/**
 * Parse URL parameters from either QR code or window location
 * * @param url Optional URL string to parse
 * @returns Parsed parameters object
 */
export const getURLParams = (url?: string): ParsedParams => {
  const parsedUrl = new URL(url || window.location.href);
  const params = new URLSearchParams(parsedUrl.search);

  return {
    ...parsePathname(parsedUrl.pathname),
    ...parseSearchParams(params),
  };
};

/**
 * Get a specific parameter value from URL
 * @param key Parameter key to look for
 * @param url Optional URL to parse (defaults to window.location)
 * @returns Parameter value or undefined if not found
 */
export const getURLParam = (key: string, url?: string): string | undefined => {
  const { params } = getURLParams(url);
  return params?.find((p) => p.key === key)?.value?.toString();
};
