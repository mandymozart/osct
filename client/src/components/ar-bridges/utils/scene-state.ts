import { router } from "@/router";
import { GameMode, PageRoute, SceneState } from "@/types";

/**
 * Scene state policy: what the AR scene (three.js + MindAR) should be doing for the app state.
 * Applied by `<ar-bridge>`.
 */

/**
 * Scene state per game mode – the camera only runs in scan mode.
 * IDLE (home, onboarding): camera released. CONSULTATION: paused, stream kept for an instant return.
 */
export const SCENE_STATE_BY_MODE: Record<GameMode, SceneState> = {
  [GameMode.IDLE]: SceneState.STOPPED,
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
