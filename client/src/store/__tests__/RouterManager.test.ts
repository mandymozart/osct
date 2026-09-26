import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGameStore } from "@/store/GameStore";
import { RouteResolver } from "@/store/managers/router/helpers";
import { GameMode, IGame, Pages } from "@/types";
import { router } from "@/router";

describe("RouteResolver", () => {
  it("creates a route from every configured slug", () => {
    for (const def of router.routes) {
      const route = RouteResolver.createRoute(def.slug);
      expect(route.page).toBe(def.page);
      expect(RouteResolver.routeExists(route)).toBe(true);
    }
  });

  it("treats routes without params as the same route", () => {
    expect(RouteResolver.isSameRoute(
      RouteResolver.createRoute("/about"),
      RouteResolver.createRoute("/about"),
    )).toBe(true);
  });

  it("compares params by key and value", () => {
    const tutorial = (value: string | number) => RouteResolver.createRoute("/tutorial", { key: "step", value });
    expect(RouteResolver.isSameRoute(tutorial(2), tutorial(2))).toBe(true);
    expect(RouteResolver.isSameRoute(tutorial(2), tutorial("2"))).toBe(true);
    expect(RouteResolver.isSameRoute(tutorial(2), tutorial(3))).toBe(false);
    expect(RouteResolver.isSameRoute(tutorial(2), RouteResolver.createRoute("/tutorial"))).toBe(false);
  });
});

describe("RouterManager", () => {
  let game: IGame;

  beforeEach(() => {
    game = createGameStore();
  });

  it("navigates to a configured route", () => {
    game.router.navigate("/about");
    expect(game.state.currentRoute?.page).toBe(Pages.ABOUT);
  });

  it("passes the route param into state", () => {
    game.router.navigate("/tutorial", { key: "step", value: 2 });
    expect(game.state.currentRoute?.param).toEqual({ key: "step", value: 2 });
  });

  // PLAN Phase 2 "Modes vs views": each route declares its mode
  it.each([
    ["/", GameMode.IDLE],
    ["/tutorial", GameMode.IDLE],
    ["/spread", GameMode.SCAN],
    ["/entries", GameMode.CONSULTATION],
    ["/entry", GameMode.CONSULTATION],
    ["/about", GameMode.CONSULTATION],
  ])("sets the mode of %s", (slug, mode) => {
    game.router.navigate(slug);
    expect(game.state.mode).toBe(mode);
  });

  it("every route either declares a mode or is an overlay", () => {
    const overlays = router.routes.filter(r => !r.mode).map(r => r.page);
    expect(overlays).toEqual([Pages.ERROR, Pages.NOT_FOUND]);
  });

  it("sets route and mode in one update (no inconsistent in-between state)", () => {
    game.router.navigate("/");
    const listener = vi.fn();
    game.subscribe(listener);

    game.router.navigate("/spread");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ mode: GameMode.SCAN, currentRoute: { page: Pages.SPREAD } });
  });

  it("shows the not-found overlay for unknown slugs and keeps the mode", () => {
    game.router.navigate("/about");
    game.router.navigate("/does-not-exist");

    expect(game.state.currentRoute?.page).toBe(Pages.NOT_FOUND);
    expect(game.state.mode).toBe(GameMode.CONSULTATION);
  });

  it("shows the error overlay, stores the error and keeps the mode", () => {
    game.router.navigate("/tutorial");
    game.router.showError({ code: "test", msg: "Boom" });

    expect(game.state.currentRoute?.page).toBe(Pages.ERROR);
    expect(game.state.currentError?.msg).toBe("Boom");
    expect(game.state.mode).toBe(GameMode.IDLE);
  });

  it("does not update the store when navigating to the current route", () => {
    game.router.navigate("/tutorial", { key: "step", value: 1 });
    const listener = vi.fn();
    game.subscribe(listener);

    game.router.navigate("/tutorial", { key: "step", value: 1 });

    expect(listener).not.toHaveBeenCalled();
  });

  it("close() returns to the scan HUD in scan mode and clears the error, in one update", () => {
    game.router.showError({ code: "test", msg: "Boom" });
    const listener = vi.fn();
    game.subscribe(listener);

    game.router.close();

    expect(game.state.currentRoute?.page).toBe(Pages.SPREAD);
    expect(game.state.mode).toBe(GameMode.SCAN);
    expect(game.state.currentError).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
