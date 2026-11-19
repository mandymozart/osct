import { router } from "@/router";
import { GameMode, type PageRoute, ArState } from "@/types";

/**
 * Scene state policy: what the AR scene (three.js + 8th Wall) should be doing for the app state.
 * Applied by `<ar-bridge>`.
 */

/**
 * Scene state per game mode – the camera only runs in scan mode.
 * IDLE (home, onboarding): camera released. CONSULTATION: paused, stream kept for an instant return.
 */
export const AR_STATE_BY_MODE: Record<GameMode, ArState> = {
  [GameMode.IDLE]: ArState.STOPPED,
  [GameMode.SCAN]: ArState.RUNNING,
  [GameMode.CONSULTATION]: ArState.PAUSED,
};

/** Overlays are routes without a mode of their own (error, not-found) */
export const isOverlayRoute = (route: PageRoute | null): boolean =>
  !!route && !router.routes.find(r => r.page === route.page)?.mode;

/**
 * What the scene should be doing for a mode and the current route.
 * An overlay pauses the scene at most: saves resources and keeps targets from being found
 * (found indicator, videos with sound) behind a page the user is reading.
 */
export const getArState = (mode: GameMode, route: PageRoute | null): ArState => {
  const byMode = AR_STATE_BY_MODE[mode];
  return isOverlayRoute(route) ? Math.min(byMode, ArState.PAUSED) : byMode;
};
