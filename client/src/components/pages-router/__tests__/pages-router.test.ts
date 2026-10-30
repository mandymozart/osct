import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameStoreService } from "@/services";
import type { BaseStore } from "@/store/BaseStore";
import { ErrorCode, type GameState } from "@/types";
import "../pages-router";

const game = GameStoreService.getInstance();
const store = game as unknown as BaseStore<GameState>;
const routeListeners = () => store.propertyListeners.get("currentRoute")?.length ?? 0;

const PAGES = ["splash-page", "spread-page", "entries-page", "entry-page", "about-page", "error-page"];

/** A router with plain stand-ins for the pages (the router only sets attributes on them) */
const mount = () => {
  const router = document.createElement("pages-router");
  PAGES.forEach(tag => router.appendChild(document.createElement(tag)));
  document.body.appendChild(router);
  return router;
};

const page = (router: HTMLElement, tag: string) => router.querySelector(tag)!;
const active = (router: HTMLElement) => PAGES.filter(tag => page(router, tag).getAttribute("active") === "true");

describe("pages-router", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    game.router.navigate("/");
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("shows only the page of the current route", () => {
    const router = mount();
    expect(active(router)).toEqual(["splash-page"]);

    game.router.navigate("/about");
    expect(active(router)).toEqual(["about-page"]);
    expect(page(router, "splash-page").getAttribute("active")).toBe("false");
  });

  it("sets the route param as a kebab-case attribute and removes it when the page is left", () => {
    const router = mount();
    game.router.navigate("/entries", { key: "category", value: "text" });
    const entries = page(router, "entries-page");
    expect(entries.getAttribute("active")).toBe("true");
    expect(entries.getAttribute("category")).toBe("text");

    game.router.navigate("/about");
    expect(entries.getAttribute("active")).toBe("false");
    expect(entries.hasAttribute("category")).toBe(false);
  });

  it("keeps the standard attributes of a page it hides", () => {
    const router = mount();
    const about = page(router, "about-page");
    about.id = "about";
    about.className = "overlay";
    game.router.navigate("/about");
    game.router.navigate("/");
    expect(about.getAttribute("active")).toBe("false");
    expect(about.id).toBe("about");
    expect(about.className).toBe("overlay");
  });

  it("shows the error overlay's page while an error is shown", () => {
    const router = mount();
    game.router.navigate("/about");
    game.router.showError({ code: ErrorCode.NOT_FOUND, msg: "x" });
    expect(active(router)).toEqual(["error-page"]);
    game.router.dismissError();
    expect(active(router)).toEqual(["about-page"]);
  });

  it("warns about a route without a page and hides the others", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const router = document.createElement("pages-router");
    router.appendChild(document.createElement("about-page"));
    document.body.appendChild(router);
    game.router.navigate("/about");
    game.router.navigate("/");
    expect(warn).toHaveBeenCalledWith("Page not found for tag: <splash-page>");
    expect(router.querySelector("about-page")!.getAttribute("active")).toBe("false");
  });

  it("hides every page when there is no route", () => {
    const router = mount() as HTMLElement & { updateRoute(route: null): void };
    router.updateRoute(null);
    expect(active(router)).toEqual([]);
  });

  it("leaves no listener on the store once disconnected, and one per connect", () => {
    const before = routeListeners();
    const wholeStore = store.listeners.length;
    const router = mount();
    expect(routeListeners()).toBe(before + 1);
    router.remove();
    expect(routeListeners()).toBe(before);

    document.body.appendChild(router);
    expect(routeListeners()).toBe(before + 1);
    router.remove();
    expect(routeListeners()).toBe(before);
    expect(store.listeners.length).toBe(wholeStore);
  });

  it("ignores route changes after it was disconnected", () => {
    const router = mount();
    router.remove();
    game.router.navigate("/about");
    expect(page(router, "about-page").getAttribute("active")).not.toBe("true");
  });
});
