import { GameStoreService } from "@/services/GameStoreService";
import {
  GameState,
  IGame,
  IPagesRouter,
  PageRoute,
  RouteParam,
} from "@/types";
import { assert, camelToKebab } from "@/utils";

export class PagesRouter extends HTMLElement implements IPagesRouter {
  private pages: Map<string, HTMLElement> = new Map();
  private game: Readonly<IGame>;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    this.handleStateChange = this.handleStateChange.bind(this);
  }

  connectedCallback() {
    this.render();
    this.setupPages();
    this.setupListeners();

    if (!this.game.state.currentRoute) {
      this.game.router.navigate("/");
    }
  }

  disconnectedCallback() {
    this.game.unsubscribe(this.handleStateChange);
  }

  private handleStateChange(state: GameState) {
    this.updateRoute(state.currentRoute);
  }

  public updateRoute(route: PageRoute | null) {
    if (!route) {
      this.hideAllPages();
      return;
    }

    const pageTag = this.getPageTag(route);
    this.updatePageVisibility(pageTag, route.param);
  }

  private getPageTag(route: PageRoute): string {
    return `${route.page}-page`;
  }

  private hideAllPages(exceptTag?: string) {
    this.pages.forEach((page) => {
      if (page.tagName.toLowerCase() === exceptTag) return;
      page.setAttribute("active", "false");
      this.cleanupParamAttributes(page);
    });
  }

  /**
   * Remove all parameter attributes that were previously set
   */
  private cleanupParamAttributes(page: HTMLElement) {
    const attributeNames = page.getAttributeNames();

    const standardAttrs = ["active", "class", "style", "id"];
    const paramAttrs = attributeNames.filter(
      (name) => !standardAttrs.includes(name)
    );
    paramAttrs.forEach((attr) => page.removeAttribute(attr));
  }

  private updatePageVisibility(pageTag: string, param?: RouteParam) {
    this.hideAllPages(pageTag);

    const activePage = this.pages.get(pageTag);
    if (activePage) {
      activePage.setAttribute("active", "true");
      if (param)
        activePage.setAttribute(
          camelToKebab(param.key),
          param.value.toString()
        );
    } else {
      console.warn(`Page not found for tag: <${pageTag}>`);
    }
  }

  private setupListeners() {
    this.game.subscribe(this.handleStateChange.bind(this));
  }

  private setupPages() {
    const slot = this.shadowRoot!.querySelector("slot");
    assert(slot, "Slot element not found");

    // Initial page setup from existing slot elements
    const initialElements = slot.assignedElements();
    if (initialElements.length > 0) {
      initialElements.forEach((page) => {
        const tagName = page.tagName.toLowerCase();
        this.pages.set(tagName, page as HTMLElement);
      });
    }
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
          // pointer-events: auto;
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
