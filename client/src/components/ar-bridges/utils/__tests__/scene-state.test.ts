import { describe, expect, it } from "vitest";
import { router } from "@/router";
import { RouteResolver } from "@/store/managers/router/helpers";
import { GameMode, Pages, SceneState } from "@/types";
import { getSceneState, isOverlayRoute, SCENE_STATE_BY_MODE } from "../scene-state";

const route = (slug: string) => RouteResolver.createRoute(slug);

describe("scene state (A-Frame bridge)", () => {
  it("has a scene state for every game mode", () => {
    for (const mode of Object.values(GameMode)) {
      expect(SCENE_STATE_BY_MODE[mode], mode).toBeDefined();
    }
  });

  it("runs the scene only in scan mode", () => {
    expect(getSceneState(GameMode.SCAN, route("/spread"))).toBe(SceneState.RUNNING);
    expect(getSceneState(GameMode.CONSULTATION, route("/entries"))).toBe(SceneState.PAUSED);
    // Phase 6: camera only in scan mode – released on home / onboarding
    expect(getSceneState(GameMode.IDLE, route("/"))).toBe(SceneState.STOPPED);
    expect(getSceneState(GameMode.IDLE, route("/error"))).toBe(SceneState.STOPPED);
  });

  it("treats routes without a mode as overlays", () => {
    const overlays = router.routes.filter(r => isOverlayRoute(RouteResolver.createRoute(r.slug))).map(r => r.page);
    expect(overlays).toEqual([Pages.ERROR, Pages.NOT_FOUND]);
    expect(isOverlayRoute(null)).toBe(false);
  });

  it("pauses the scene under an overlay, whatever the mode", () => {
    expect(getSceneState(GameMode.SCAN, route("/error"))).toBe(SceneState.PAUSED);
    expect(getSceneState(GameMode.SCAN, route("/not-found"))).toBe(SceneState.PAUSED);
    expect(getSceneState(GameMode.CONSULTATION, route("/error"))).toBe(SceneState.PAUSED);
  });

  it("uses the mode alone before the first route", () => {
    expect(getSceneState(GameMode.SCAN, null)).toBe(SceneState.RUNNING);
  });
});
