import { ErrorInfo, GameStore, PageRoute, Pages, Route, RouteParam, SlugRoute } from "../types";

/**
 * Manages pages overlays
 */
export class PagesRouterManager {
  private store: GameStore; // Reference to the main store

  constructor(store: GameStore) {
    this.store = store;
  }

  public getCurrentRoute(): Route {
    return this.store.state.currentRoute
  }

  /**
   * Navigate to a different page
   * @param to Pages enum or string of url slug
   * @param params Optional route parameters
   */
  public navigate(to: Pages | string, params?: RouteParam[]): void {
    let route: Route;

    if (typeof to === 'string' && to.startsWith('/')) {
      // Handle as slug route
      route = {
        slug: to,
        params
      } as SlugRoute;
    } else {
      // Handle as page route
      const page = typeof to === 'string' 
        ? Object.values(Pages).find(p => p.toLowerCase() === to.toLowerCase()) || Pages.NOT_FOUND 
        : to;

      route = {
        page,
        params
      } as PageRoute;
    }

    // Don't navigate if we're already on this page
    if ('page' in route && 
        'page' in this.store.state.currentRoute && 
        this.store.state.currentRoute.page === route.page) {
      return;
    }

    // Check if route exists in configuration
    const exists = this.store.configuration.router?.routes.some(r => 
      ('page' in route && 'page' in r && r.page === route.page) ||
      ('slug' in route && 'slug' in r && r.slug === route.slug)
    );

    if (exists) {
      this.store.set({ currentRoute: route });
    } else {
      this.store.set({ currentRoute: { page: Pages.NOT_FOUND } as PageRoute });
    }
  }

  public showError(error: ErrorInfo): void {
    console.error(error)
    // TODO: Implement how the message gets injected into the page
    // An error boundary could solve the trick and replace the need for manually calling an error screen
    this.store.set({ currentRoute: Pages.ERROR });
  }

  /**
   * Close overlay pages
   */
  public close(): void {
    this.store.set({ currentRoute: null });
  }
}
