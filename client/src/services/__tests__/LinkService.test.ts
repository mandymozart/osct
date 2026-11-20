import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameStoreService } from "@/services/GameStoreService";
import { LinkService, linkForState, parseLink, pathForRoute, resolveAddress, resolveLink } from "../LinkService";
import { GameMode, Pages } from "@/types";
import { getEntries, getScenes } from "@/utils/game-config";

const game = GameStoreService.getInstance();
const version = game.version.version;
const scene = getScenes()[1].id;
const entries = getEntries();
const entry = entries[0].id;

describe("links: parsing", () => {
  it("reads route, value and version from path and query", () => {
    expect(parseLink(`/entry/${entry}`, `?osct=1.1.0`)).toEqual({ slug: "/entry", value: entry, version: "1.1.0" });
    expect(parseLink("/scene/scene1", "")).toEqual({ slug: "/scene", value: "scene1", version: undefined });
    expect(parseLink("/about/", "")).toEqual({ slug: "/about", value: undefined, version: undefined });
  });

  it("accepts the route param name as a segment (/entries/category/video)", () => {
    expect(parseLink("/entries/category/video", "")).toMatchObject({ slug: "/entries", value: "video" });
    expect(parseLink("/entries/video", "")).toMatchObject({ slug: "/entries", value: "video" });
  });

  it("treats the start page as no link (old ?code= links are not supported)", () => {
    expect(parseLink("/", "?osct=1.1.0")).toBeNull();
    expect(parseLink("/", "?code=c-scene1&osct=1.1.0")).toBeNull();
  });

  it("decodes path segments", () => {
    expect(parseLink("/entry/a%20b", "")).toMatchObject({ value: "a b" });
  });
});

describe("links: building", () => {
  const route = (page: Pages, slug: string, param?: { key: string; value: string }) => ({ page, slug, param });

  it("writes one path per view, the active scene for scan mode", () => {
    expect(pathForRoute(route(Pages.SPLASH, "/"), null)).toBe("/");
    expect(pathForRoute(route(Pages.SCENE, "/scene"), "scene2")).toBe("/scene/scene2");
    expect(pathForRoute(route(Pages.ENTRIES, "/entries", { key: "category", value: "video" }), null)).toBe("/entries/video");
    expect(pathForRoute(route(Pages.ENTRY, "/entry", { key: "entryId", value: "a b" }), null)).toBe("/entry/a%20b");
    expect(pathForRoute(route(Pages.TUTORIAL, "/tutorial", { key: "step", value: "2" }), null)).toBe("/tutorial/2");
  });

  it("keeps the URL for overlays and adds the version to every link", () => {
    expect(pathForRoute(route(Pages.NOT_FOUND, "/not-found"), null)).toBeNull();
    expect(pathForRoute(route(Pages.ERROR, "/error"), null)).toBeNull();
    expect(linkForState({ currentRoute: route(Pages.ABOUT, "/about"), currentScene: null }, "1.1.0")).toBe("/about?osct=1.1.0");
  });

});

describe("links: resolving", () => {
  beforeEach(() => {
    game.history.reset();
    game.history.consultEntry(entry);
    game.router.navigate("/");
  });

  it("opens a scene in scan mode", () => {
    expect(resolveLink(game, { slug: "/scene", value: scene, version })).toBe(true);
    expect(game.state.currentScene).toBe(scene);
    expect(game.state.currentRoute?.page).toBe(Pages.SCENE);
    expect(game.state.mode).toBe(GameMode.SCAN);
  });

  it("opens an entry, a category and a tutorial step", () => {
    resolveLink(game, { slug: "/entry", value: entry });
    expect(game.state.currentRoute).toMatchObject({ page: Pages.ENTRY, param: { value: entry } });
    resolveLink(game, { slug: "/entries", value: "video" });
    expect(game.state.currentRoute).toMatchObject({ page: Pages.ENTRIES, param: { value: "video" } });
    resolveLink(game, { slug: "/entries", value: "all" });
    expect(game.state.currentRoute).toMatchObject({ page: Pages.ENTRIES, param: { value: "all" } });
    expect(resolveLink(game, { slug: "/credits" })).toBe(true);
    expect(game.state.currentRoute?.page).toBe(Pages.CREDITS);
    resolveLink(game, { slug: "/tutorial", value: "2" });
    expect(game.state.currentRoute).toMatchObject({ page: Pages.TUTORIAL, param: { value: "2" } });
  });

  it("opens scan mode on the entry's scene when the reader hasn't found the entry yet", () => {
    const unfound = entries.find(e => e.id !== entry && e.sceneId !== game.state.currentScene) ?? entries[1];
    expect(resolveLink(game, { slug: "/entry", value: unfound.id })).toBe(true);
    expect(game.state.currentRoute?.page).toBe(Pages.SCENE);
    expect(game.state.currentScene).toBe(unfound.sceneId);
    expect(game.history.isConsulted(unfound.id)).toBe(false);
  });

  it.each([
    [{ slug: "/entry", value: "no-such-entry" }],
    [{ slug: "/scene", value: "no-such-scene" }],
    [{ slug: "/entries", value: "videos" }],
    [{ slug: "/tutorial", value: "99" }],
    [{ slug: "/entry" }],
    [{ slug: "/nowhere" }],
    [{ slug: "/about", value: "extra" }],
    [{ slug: "/credits", value: "extra" }],
  ])("shows not found for %o", link => {
    expect(resolveLink(game, link)).toBe(false);
    expect(game.state.currentRoute?.page).toBe(Pages.NOT_FOUND);
  });

  it("a rule's goto (schema 5.0) opens scene:<id> like a link; another address or an unknown scene only logs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveAddress(game, `scene:${scene}`)).toBe(true);
    expect(game.state.currentScene).toBe(scene);
    expect(game.state.currentRoute?.page).toBe(Pages.SCENE);
    game.router.navigate("/about");
    expect(resolveAddress(game, "scene:no-such-scene")).toBe(false);
    expect(resolveAddress(game, `target:${scene}/x`)).toBe(false);
    expect(resolveAddress(game, "nonsense")).toBe(false);
    expect(game.state.currentRoute?.page).toBe(Pages.ABOUT);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("routes links of any version (the version is informative only)", () => {
    expect(resolveLink(game, { slug: "/entry", value: entry, version: "0.9.0" })).toBe(true);
    expect(game.state.currentRoute?.page).toBe(Pages.ENTRY);
    expect(resolveLink(game, { slug: "/scene", value: scene, version: "999.0.0" })).toBe(true);
    expect(game.state.currentRoute?.page).toBe(Pages.SCENE);
  });
});

describe("links: address bar", () => {
  const links = LinkService.getInstance();
  const path = () => `${window.location.pathname}${window.location.search}`;
  // happy-dom's history API doesn't move window.location – set it directly and record the calls
  const setUrl = (url: string) => (window as any).happyDOM.setURL(new URL(url, window.location.origin).href);
  const pushed: string[] = [];
  const replaced: string[] = [];

  beforeEach(() => {
    pushed.length = replaced.length = 0;
    vi.spyOn(window.history, "pushState").mockImplementation((_s, _t, url) => { pushed.push(String(url)); setUrl(String(url)); });
    vi.spyOn(window.history, "replaceState").mockImplementation((_s, _t, url) => { replaced.push(String(url)); setUrl(String(url)); });
    setUrl("/");
    game.history.consultEntry(entry);
    game.router.navigate("/");
  });
  afterEach(() => {
    links.stopSync();
    vi.restoreAllMocks();
  });

  it("opens the link the app was started with", () => {
    setUrl(`/entry/${entry}?osct=${version}`);
    expect(links.openIncomingLink(game)).toBe(true);
    expect(game.state.currentRoute?.page).toBe(Pages.ENTRY);

    setUrl("/");
    expect(links.openIncomingLink(game)).toBe(false);
  });

  it("follows the state: views push, scene switches replace, overlays keep the URL", () => {
    links.startSync(game);
    expect(path()).toBe(`/?osct=${version}`);

    // Leaving the splash replaces its entry (back must not replay it)
    game.router.navigate("/about");
    expect(pushed).toEqual([]);
    expect(replaced.at(-1)).toBe(`/about?osct=${version}`);

    game.router.navigate("/entries", { key: "category", value: "text" });
    expect(path()).toBe(`/entries/text?osct=${version}`);
    expect(pushed).toEqual([`/entries/text?osct=${version}`]);

    game.scenes.switchScene(getScenes()[0].id);
    game.router.navigate("/scene");
    game.scenes.switchScene(scene);
    expect(path()).toBe(`/scene/${scene}?osct=${version}`);
    expect(pushed).toHaveLength(2);
    expect(replaced.at(-1)).toBe(`/scene/${scene}?osct=${version}`);

    game.router.navigate("/not-found");
    expect(path()).toBe(`/scene/${scene}?osct=${version}`);
  });

  it("follows the back button", () => {
    links.startSync(game);
    game.router.navigate("/about");
    setUrl(`/entries/link?osct=${version}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(game.state.currentRoute).toMatchObject({ page: Pages.ENTRIES, param: { value: "link" } });
  });
});
