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
   * @param to Target page (Pages enum or URL slug)
   * @param param Optional route parameter
   */
  navigate(to: string, param?: RouteParam): void;

  showError(error: ErrorInfo): void;

  /** Dismiss the error / notice overlay and return to the view underneath */
  dismissError(): void;

  /** Close overlay pages and clear the current route */
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
  SPLASH = "splash",
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
