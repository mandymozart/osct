// Relative, not "@/…": the inline landing decision in index.html is built from this file too (#343)
import { BREAKPOINT_TABLET } from "../constants";

/** sessionStorage key a developer sets by hand ("1") to get the app on a computer – visitors cannot (#354) */
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

/**
 * What the page loads (#355): the landing (`page` – the static landing written into index.html is this experience's
 * own: the build's default experience, or none named; `skeleton` – another experience: the same page as placeholders
 * until its data is there) or, `null`, the app. A computer gets the landing on every experience's path; a developer who
 * set `LANDING_SKIPPED_KEY` gets the app. The inline decision in index.html is this rule's twin
 * (landing-decision-html.ts) – a test keeps the two equal case by case.
 */
export type LandingMode = "page" | "skeleton" | null;

export const landingMode = (signals: DeviceSignals, skipped: boolean, experience: string | null, fallback: string | null): LandingMode => {
  if (!isDesktopVisitor(signals) || skipped) return null;
  return experience === null || experience === fallback ? "page" : "skeleton";
};
