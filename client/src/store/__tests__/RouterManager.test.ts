import { beforeEach, describe, expect, it } from "vitest";
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

  it("builds the URL including the param value", () => {
    const route = RouteResolver.createRoute("/spread", { key: "spreadId", value: "spread1" });
    expect(RouteResolver.getUrlForRoute(route)).toBe("/spread/spread1");
  });

  it("treats routes without params as the same route", () => {
    expect(RouteResolver.isSameRoute(
      RouteResolver.createRoute("/about"),
      RouteResolver.createRoute("/about"),
    )).toBe(true);
  });

  // Known bug (PLAN.md Phase 2): params are compared by reference.
  // Drop `.fails` once isSameRoute compares key + value.
  it.fails("treats equal params as the same route", () => {
    expect(RouteResolver.isSameRoute(
      RouteResolver.createRoute("/index", { key: "category", value: "glossary" }),
      RouteResolver.createRoute("/index", { key: "category", value: "glossary" }),
    )).toBe(true);
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

  // RouteResolver.createRoute throws before navigate() reaches its not-found branch.
  // Documents current behaviour; Phase 2 should send unknown slugs to /not-found instead.
  it("throws on an unknown slug (not-found page is unreachable)", () => {
    expect(() => game.router.navigate("/does-not-exist")).toThrow(/Route not found/);
  });

  it("shows the error page and stores the error", () => {
    game.router.showError({ code: "test", msg: "Boom" });
    expect(game.state.currentRoute?.page).toBe(Pages.ERROR);
    expect(game.state.currentError?.msg).toBe("Boom");
  });

  it("close() returns to the scan HUD, sets the scan mode and clears the error", () => {
    game.router.showError({ code: "test", msg: "Boom" });
    game.router.close();

    expect(game.state.currentRoute?.page).toBe(Pages.SPREAD);
    expect(game.state.mode).toBe(GameMode.DEFAULT);
    expect(game.state.currentError).toBeNull();
  });
});
