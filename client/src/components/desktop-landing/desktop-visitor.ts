// Relative, not "@/constants": the inline landing decision in index.html is built from this file too (#343)
import { BREAKPOINT_TABLET } from "../../constants";

/** Where this browser tab remembers that the visitor chose to open the app on the computer anyway */
export const LANDING_SKIPPED_KEY = "osct-desktop-landing-skipped";

/** What the browser tells about the device, read once at startup (`readDeviceSignals`) */
export interface DeviceSignals {
  /** Running as the installed app (home screen / desktop PWA) */
  standalone: boolean;
  /** The primary pointer is a finger (phones, tablets) */
  coarsePointer: boolean;
  /** The browser names a phone or tablet (user agent, or iPadOS posing as a Mac with touch) */
  mobileAgent: boolean;
  /** The viewport is at least the tablet breakpoint wide (900 px at the default text size) */
  wide: boolean;
}

/**
 * The desktop landing page's test (#293): shown to a visitor on a computer – a mouse or trackpad as the primary pointer,
 * no phone or tablet browser, a wide window – and never in the installed app. Phones and tablets (touch first) open the
 * app as before; so does a narrow desktop window. The rear camera is not asked: that needs the camera permission.
 */
export const isDesktopVisitor = ({ standalone, coarsePointer, mobileAgent, wide }: DeviceSignals): boolean =>
  !standalone && !coarsePointer && !mobileAgent && wide;

export const readDeviceSignals = (win: Window = window): DeviceSignals => {
  const matches = (query: string): boolean => win.matchMedia?.(query).matches ?? false;
  const nav = win.navigator as Navigator & { standalone?: boolean };
  const ipad = nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
  return {
    standalone: matches("(display-mode: standalone)") || nav.standalone === true,
    coarsePointer: matches("(pointer: coarse)"),
    mobileAgent: ipad || /Android|iPhone|iPad|iPod|Mobi/i.test(nav.userAgent),
    wide: matches(`(min-width: ${BREAKPOINT_TABLET}em)`),
  };
};

/** The pages a computer opens directly, without the landing in front (#353): `privacy`, linked from the landing's footer */
export const LANDING_FREE_PAGES: readonly string[] = ["privacy"];

/** Whether the path's last segment is one of `LANDING_FREE_PAGES` (`/osct/privacy`, `/privacy/`) */
export const isLandingFreePath = (pathname: string): boolean => {
  const last = pathname.split("/").filter(Boolean).pop()?.toLowerCase();
  return last !== undefined && LANDING_FREE_PAGES.includes(last);
};

/** The visitor chose "open here" in this tab (sessionStorage: a new visit shows the landing page again) */
export const landingSkipped = (): boolean => {
  try {
    return sessionStorage.getItem(LANDING_SKIPPED_KEY) === "1";
  } catch {
    return false;
  }
};

export const skipLanding = (): void => {
  try {
    sessionStorage.setItem(LANDING_SKIPPED_KEY, "1");
  } catch {
    // Blocked storage: the landing page shows again on the next reload
  }
};
