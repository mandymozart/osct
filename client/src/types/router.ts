import { ErrorInfo } from "./errors";
import { GameMode } from "./game";

export interface IPagesRouter extends HTMLElement {
  updateRoute(route: PageRoute | null): void;
}

export interface RouterManagerState {
  currentRoute: PageRoute | null;
  currentError: ErrorInfo | null;
}

export interface IRouterManager {
  /**
   * Navigate to a different page
   * @param to Target page (Pages enum or URL slug)
   * @param params Optional route parameters
   */
  navigate(to: string, param?: RouteParam): void;

  /**
   * Show error page with error information
   * @param error Error information to display
   */
  showError(error: ErrorInfo): void;

  /**
   * Close overlay pages and clear current route
   */
  close(): void;
}

export type PageRoute = {
  page: Pages;
  slug: string;
  param?: RouteParam;
}

export type RouteParam = {
  key: string;
  value: string | number;
}

export enum Pages {
  HOME = "home",
  TUTORIAL = "tutorial",
  SPREAD = "spread",
  ABOUT = "about",
  ERROR = "error",
  NOTIFICATION = "notification",
  ENTRIES = "entries",
  ENTRY = "entry",
  NOT_FOUND = "not-found",
}

export interface PageRouteDefinition {
  page: Pages;
  slug: string;
  param?: string;
  /** Mode applied when navigating here; routes without a mode (overlays) keep the current mode */
  mode?: GameMode;
}

export type PageRouterConfiguration = {
  baseUrl: string;
  routes: PageRouteDefinition[];
};
