import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameStoreService } from "@/services/GameStoreService";
import { isNewerVersion, LinkService, linkForState, parseLink, pathForRoute, resolveLink } from "../LinkService";
import { GameMode, Pages } from "@/types";
import { getEntries, getSpreads } from "@/utils/game-config";

const game = GameStoreService.getInstance();
const version = game.version.version;
const spread = getSpreads()[1].id;
const entries = getEntries();
const entry = entries[0].id;

describe("links: parsing", () => {
  it("reads route, value and version from path and query", () => {
    expect(parseLink(`/entry/${entry}`, `?osct=1.1.0`)).toEqual({ slug: "/entry", value: entry, version: "1.1.0" });
    expect(parseLink("/spread/spread1", "")).toEqual({ slug: "/spread", value: "spread1", version: undefined });
    expect(parseLink("/about/", "")).toEqual({ slug: "/about", value: undefined, version: undefined });
  });

  it("accepts the route param name as a segment (/entries/category/video)", () => {
    expect(parseLink("/entries/category/video", "")).toMatchObject({ slug: "/entries", value: "video" });
    expect(parseLink("/entries/video", "")).toMatchObject({ slug: "/entries", value: "video" });
  });

  it("treats the start page as no link (old ?code= links are not supported)", () => {
    expect(parseLink("/", "?osct=1.1.0")).toBeNull();
    expect(parseLink("/", "?code=c-spread1&osct=1.1.0")).toBeNull();
  });

  it("decodes path segments", () => {
    expect(parseLink("/entry/a%20b", "")).toMatchObject({ value: "a b" });
  });
});

describe("links: building", () => {
  const route = (page: Pages, slug: string, param?: { key: string; value: string }) => ({ page, slug, param });

  it("writes one path per view, the active spread for scan mode", () => {
    expect(pathForRoute(route(Pages.HOME, "/"), null)).toBe("/");
    expect(pathForRoute(route(Pages.SPREAD, "/spread"), "spread2")).toBe("/spread/spread2");
    expect(pathForRoute(route(Pages.ENTRIES, "/entries", { key: "category", value: "video" }), null)).toBe("/entries/video");
    expect(pathForRoute(route(Pages.ENTRY, "/entry", { key: "entryId", value: "a b" }), null)).toBe("/entry/a%20b");
    expect(pathForRoute(route(Pages.TUTORIAL, "/tutorial", { key: "step", value: "2" }), null)).toBe("/tutorial/2");
  });

  it("keeps the URL for overlays and adds the version to every link", () => {
    expect(pathForRoute(route(Pages.NOT_FOUND, "/not-found"), null)).toBeNull();
    expect(pathForRoute(route(Pages.ERROR, "/error"), null)).toBeNull();
    expect(linkForState({ currentRoute: route(Pages.ABOUT, "/about"), currentSpread: null }, "1.1.0")).toBe("/about?osct=1.1.0");
  });

  it("compares versions: only a newer link version needs an update", () => {
    expect(isNewerVersion("1.2.0", "1.1.9")).toBe(true);
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("1.1.0", "1.1.0")).toBe(false);
    expect(isNewerVersion("0.9.0", "1.1.0")).toBe(false);
    expect(isNewerVersion(undefined, "1.1.0")).toBe(false);
    expect(isNewerVersion("garbage", "1.1.0")).toBe(false);
  });
});

describe("links: resolving", () => {
  beforeEach(() => {
    game.history.reset();
    game.history.consultEntry(entry);
    game.router.navigate("/");
  });

  it("opens a spread in scan mode", () => {
    expect(resolveLink(game, { slug: "/spread", value: spread, version })).toBe(true);
    expect(game.state.currentSpread).toBe(spread);
    expect(game.state.currentRoute?.page).toBe(Pages.SPREAD);
    expect(game.state.mode).toBe(GameMode.SCAN);
  });

  it("opens an entry, a category and a tutorial step", () => {
    resolveLink(game, { slug: "/entry", value: entry });
    expect(game.state.currentRoute).toMatchObject({ page: Pages.ENTRY, param: { value: entry } });
    resolveLink(game, { slug: "/entries", value: "video" });
    expect(game.state.currentRoute).toMatchObject({ page: Pages.ENTRIES, param: { value: "video" } });
    resolveLink(game, { slug: "/tutorial", value: "2" });
    expect(game.state.currentRoute).toMatchObject({ page: Pages.TUTORIAL, param: { value: "2" } });
  });

  it("opens scan mode on the entry's spread when the reader hasn't found the entry yet", () => {
    const unfound = entries.find(e => e.id !== entry && e.spreadId !== game.state.currentSpread) ?? entries[1];
    expect(resolveLink(game, { slug: "/entry", value: unfound.id })).toBe(true);
    expect(game.state.currentRoute?.page).toBe(Pages.SPREAD);
    expect(game.state.currentSpread).toBe(unfound.spreadId);
    expect(game.history.isConsulted(unfound.id)).toBe(false);
  });

  it.each([
    [{ slug: "/entry", value: "no-such-entry" }],
    [{ slug: "/spread", value: "no-such-spread" }],
    [{ slug: "/entries", value: "videos" }],
    [{ slug: "/tutorial", value: "99" }],
    [{ slug: "/entry" }],
    [{ slug: "/nowhere" }],
    [{ slug: "/about", value: "extra" }],
  ])("shows not found for %o", link => {
    expect(resolveLink(game, link)).toBe(false);
    expect(game.state.currentRoute?.page).toBe(Pages.NOT_FOUND);
  });

  it("asks for a reload when the link comes from a newer app", () => {
    expect(resolveLink(game, { slug: "/spread", value: spread, version: "999.0.0" })).toBe(false);
    expect(game.state.currentRoute?.page).toBe(Pages.ERROR);
    expect(game.state.currentError?.action?.text).toBe("Reload");
  });

  it("routes older links like current ones", () => {
    expect(resolveLink(game, { slug: "/entry", value: entry, version: "0.9.0" })).toBe(true);
    expect(game.state.currentRoute?.page).toBe(Pages.ENTRY);
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

  it("follows the state: views push, spread switches replace, overlays keep the URL", () => {
    links.startSync(game);
    expect(path()).toBe(`/?osct=${version}`);

    game.router.navigate("/entries", { key: "category", value: "text" });
    expect(path()).toBe(`/entries/text?osct=${version}`);
    expect(pushed).toEqual([`/entries/text?osct=${version}`]);

    game.spreads.switchSpread(getSpreads()[0].id);
    game.router.navigate("/spread");
    game.spreads.switchSpread(spread);
    expect(path()).toBe(`/spread/${spread}?osct=${version}`);
    expect(pushed).toHaveLength(2);
    expect(replaced.at(-1)).toBe(`/spread/${spread}?osct=${version}`);

    game.router.navigate("/not-found");
    expect(path()).toBe(`/spread/${spread}?osct=${version}`);
  });

  it("follows the back button", () => {
    links.startSync(game);
    game.router.navigate("/about");
    setUrl(`/entries/link?osct=${version}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(game.state.currentRoute).toMatchObject({ page: Pages.ENTRIES, param: { value: "link" } });
  });
});
