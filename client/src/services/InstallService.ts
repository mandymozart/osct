/**
 * "Add to Home Screen" (PWA install), offered as an action on the Info page.
 * Chrome / Edge / Samsung Internet fire `beforeinstallprompt` once, shortly after load; `start()` (main.ts)
 * keeps the event so the Info page can open the browser's install dialog later. The event is not
 * prevented, so Chrome's own install banner still appears. iOS has no install dialog: readers use
 * Share → "Add to Home Screen" (explained on the Info page).
 */

/** Chromium's install prompt event (not in the DOM typings) */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * How this device installs the app:
 * - `installed`: running from the home screen already
 * - `added`: just installed from this browser tab (`appinstalled`) – open it from the home screen
 * - `prompt`: the browser's own install dialog is available
 * - `ios`: Safari's Share → "Add to Home Screen"
 * - `manual`: other browsers – their menu, if they support it at all
 */
export type InstallMethod = "installed" | "added" | "prompt" | "ios" | "manual";

const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export class InstallService {
  private static instance: InstallService | null = null;
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private installed = false;
  private listeners = new Set<() => void>();

  static getInstance(): InstallService {
    if (!InstallService.instance) InstallService.instance = new InstallService();
    return InstallService.instance;
  }

  /** Keeps the browser's install prompt for later (call once at startup, before the event fires) */
  start(): void {
    window.addEventListener("beforeinstallprompt", event => {
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.notify();
    });
    window.addEventListener("appinstalled", () => {
      this.installed = true;
      this.deferredPrompt = null;
      this.notify();
    });
  }

  getMethod(): InstallMethod {
    if (this.isStandalone()) return "installed";
    if (this.installed) return "added";
    if (this.deferredPrompt) return "prompt";
    return isIOS() ? "ios" : "manual";
  }

  /** Shows the browser's install dialog (each prompt event is single-use); true when the reader accepted */
  async prompt(): Promise<boolean> {
    const event = this.deferredPrompt;
    if (!event) return false;
    this.deferredPrompt = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    this.notify();
    return outcome === "accepted";
  }

  /** Listener runs whenever the install method may have changed; returns the unsubscribe function */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** iPhone / iPad (where Safari and the home-screen app keep separate storage) */
  isIOS(): boolean {
    return isIOS();
  }

  /**
   * Whether files cached by the service worker persist here (relevant for the whole-book download).
   * Requires a service worker (always true under `npm run dev`, for testing). On iOS only the home-screen
   * app qualifies: Safari tabs have separate storage and clear it after 7 days without use.
   */
  keepsDownloads(): boolean {
    if (import.meta.env.DEV) return true;
    if (!("serviceWorker" in navigator)) return false;
    return !isIOS() || this.isStandalone();
  }

  private isStandalone(): boolean {
    return window.matchMedia?.("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }

  private notify(): void {
    this.listeners.forEach(listener => listener());
  }
}
