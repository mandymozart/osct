import { GameStoreService } from "../services/GameStoreService";
import { GameState, IGame, IPagesRouter, IRouterManager, Route, RouteParam } from "../types";
import { assert } from "../utils/assert";
import { router as routerConfig } from "../router";

export class PagesRouter extends HTMLElement implements IPagesRouter {
  private pages: Map<string, HTMLElement> = new Map();
  private game: IGame | null = null;
  private router: IRouterManager | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.handleStateChange = this.handleStateChange.bind(this);
  }

  connectedCallback() {
    this.game = GameStoreService.getInstance().getGame();
    assert(this.game, "Game store not initialized");
    this.router = this.game.router;
    assert(this.router, "Router manager not initialized");

    this.render();
    this.setupPages();
    this.setupListeners();

    // Only navigate to home if there's no current route AND we're at the root URL
    if (!this.game.state.currentRoute && (window.location.pathname === '/' || window.location.pathname === '')) {
      this.game.router.navigate("/"); // Use slug for home page
    }
  }

  disconnectedCallback() {
    if (this.game) {
      this.game.unsubscribe(this.handleStateChange);
    }
  }

  private handleStateChange(state: GameState) {
    this.updateRoute(state.currentRoute);
  }

  public updateRoute(route: Route | null) {
    if (!route) {
      this.hideAllPages();
      return;
    }

    const pageTag = this.getPageTag(route);
    this.updatePageVisibility(pageTag, route.params);
  }

  private getPageTag(route: Route): string {
    if ("page" in route) {
      return `${route.page.toLowerCase()}-page`;
    }
    // For slug routes, try to find matching route in configuration
    const configRoute = routerConfig.routes.find(
      (r) => "slug" in r && r.slug === route.slug
    );

    return configRoute && "page" in configRoute
      ? `${configRoute.page.toLowerCase()}-page`
      : "not-found-page";
  }

  private hideAllPages() {
    this.pages.forEach((page) => {
      page.setAttribute("active", "false");
    });
  }

  private updatePageVisibility(pageTag: string, params?: RouteParam[]) {
    this.hideAllPages();

    const activePage = this.pages.get(pageTag);
    if (activePage) {
      activePage.setAttribute("active", "true");
      if (params) {
        activePage.setAttribute("route-params", JSON.stringify(params));
      } else {
        activePage.removeAttribute("route-params");
      }
    }
  }

  private setupListeners() {
    assert(this.game, "Game store not initialized");
    this.game.subscribe(this.handleStateChange);
  }

  private setupPages() {
    const slot = this.shadowRoot!.querySelector("slot");
    assert(slot, "Slot element not found");

    slot.addEventListener("slotchange", () => {
      const elements = slot.assignedElements();
      elements.forEach((page) => {
        const tagName = page.tagName.toLowerCase();
        this.pages.set(tagName, page as HTMLElement);
      });
    });
  }

  private render() {
    this.shadowRoot!.innerHTML = /* html */ `
      <style>
        :host {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        ::slotted(*) {
          display: none;
          pointer-events: auto;
        }
        ::slotted([active="true"]) {
          display: block;
        }
      </style>
      <slot></slot>
    `;
  }
}

customElements.define("pages-router", PagesRouter);
