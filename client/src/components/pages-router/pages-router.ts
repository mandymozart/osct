import { GameStoreService } from "@/services";
import {
  IGame,
  IPagesRouter,
  PageRoute,
  RouteParam,
} from "@/types";
import { assert, camelToKebab } from "@/utils";

/**
 * Shows the slotted `<x-page>` element matching the store's `currentRoute` (`<page>-page`) and hides all
 * others. The route param is set as a kebab-case attribute on the active page; stale param attributes are
 * removed from pages that become inactive.
 */
export class PagesRouter extends HTMLElement implements IPagesRouter {
  private pages: Map<string, HTMLElement> = new Map();
  private game: Readonly<IGame>;
  private shadow: ShadowRoot;
  /** Cleanup of the `currentRoute` subscription while connected */
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
    this.setupPages();
    this.setupListeners();

    // A route set before the router connected is shown at once
    if (this.game.state.currentRoute) this.updateRoute(this.game.state.currentRoute);
    else this.game.router.navigate("/");
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
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

  /** Removes route param attributes (everything except active/class/style/id) */
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
    this.unsubscribe?.();
    this.unsubscribe = this.game.subscribeToProperty("currentRoute", route => this.updateRoute(route));
  }

  private setupPages() {
    const slot = this.shadow.querySelector("slot");
    assert(slot, "Slot element not found");

    const initialElements = slot.assignedElements();
    if (initialElements.length > 0) {
      initialElements.forEach((page) => {
        const tagName = page.tagName.toLowerCase();
        this.pages.set(tagName, page as HTMLElement);
      });
    }
  }

  private render() {
    this.shadow.innerHTML = /* html */ `
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
