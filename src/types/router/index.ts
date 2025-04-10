import { ErrorInfo } from "../../types";

export interface IPagesRouter extends HTMLElement {
  updateRoute(route: PageRoute | null): void;
}

export interface RouterManagerState {
  currentRoute: PageRoute | null;
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

export interface IPageRouter {
  navigate(): void;
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
  CHAPTERS = "chapters",
  CHAPTER = "chapter",
  ABOUT = "about",
  ERROR = "error",
  INDEX = "index",
  NOT_FOUND = "not-found",
}

export interface PageRouteDefinition {
  page: Pages;
  slug: string;
  param?: string;
}

export type PageRouterConfiguration = {
  baseUrl: string;
  routes: PageRouteDefinition[];
};
