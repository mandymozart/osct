import { LoadableStore } from "../LoadableStore";
import { ErrorInfo, GameStore, Pages, Route } from "../types";

/**
 * Manages pages overlays
 */
export class PageRouter {
  private store: GameStore; // Reference to the main store

  constructor(store: GameStore) {
    this.store = store;
  }

  /**
   * Navigate to a specific route
   */
  public navigate(route: Route): void {
    if (this.store.state.currentRoute?.page === route.page) {
      return;
    }
    const exists =
      this.store.configuration.router?.routes.findIndex(
        (r) => r.page === route.page
      ) !== -1;
    if (exists) {
      this.store.set({ currentRoute: route });
    } else {
      this.store.set({ currentRoute: { page: Pages.NOT_FOUND } });
    }
    // TODO: actually check if the state change is updating the page webcomponents
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
