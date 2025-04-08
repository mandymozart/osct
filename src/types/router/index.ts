import { ErrorInfo } from "../../types";

export interface IPagesRouter extends HTMLElement {
  updateRoute(route: Route | null): void;
}

export interface RouterManagerState {
  currentRoute: Route | null;
}

export interface IRouterManager {
  /**
   * Navigate to a different page
   * @param to Target page (Pages enum or URL slug)
   * @param params Optional route parameters
   */
  navigate(to: Pages | string, params?: RouteParam[]): void;

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

export interface PageRouter {
  navigate(): void;
  close(): void;
}

export interface RouterConfig {
  baseUrl: string;
  routes: Route[];
}

export type PageRoute = {
  page: Pages;
  params?: RouteParam[];
}

export type SlugRoute = {
  slug: string;
  params?: RouteParam[];
}

export type Route = PageRoute | SlugRoute;

export type RouteParam = {
  key: string;
  value: string | number | boolean | Record<string, unknown>;
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
