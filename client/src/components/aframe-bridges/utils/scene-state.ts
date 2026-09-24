import { router } from "@/router";
import { GameMode, PageRoute, SceneState } from "@/types";

/**
 * Scene state policy of the A-Frame bridge: what the scene / MindAR (an A-Frame plugin) should be
 * doing for the app state. Applied by the scene bridge (PLAN Phase 2 "Modes vs views").
 */

/**
 * Scene state per game mode.
 * IDLE should be STOPPED (camera released) – that needs MindAR `autoStart: false`
 * (Phase 5 "Grant access" / Phase 6), until then the camera is already running, so PAUSED.
 */
export const SCENE_STATE_BY_MODE: Record<GameMode, SceneState> = {
  [GameMode.IDLE]: SceneState.PAUSED,
  [GameMode.SCAN]: SceneState.RUNNING,
  [GameMode.CONSULTATION]: SceneState.PAUSED,
};

/** Overlays are routes without a mode of their own (error, not-found) */
export const isOverlayRoute = (route: PageRoute | null): boolean =>
  !!route && !router.routes.find(r => r.page === route.page)?.mode;

/**
 * What the scene should be doing for a mode and the current route.
 * An overlay pauses the scene at most: saves resources and keeps targets from being found
 * (found indicator, videos with sound) behind a page the user is reading.
 */
export const getSceneState = (mode: GameMode, route: PageRoute | null): SceneState => {
  const byMode = SCENE_STATE_BY_MODE[mode];
  return isOverlayRoute(route) ? Math.min(byMode, SceneState.PAUSED) : byMode;
};
