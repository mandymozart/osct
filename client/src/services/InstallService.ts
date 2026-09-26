/**
 * "Add to Home Screen" (PWA, Tilman 2026-09-27: an action on the Info page, not in the onboarding).
 * Chrome / Edge / Samsung Internet announce installability with `beforeinstallprompt` once, early after
 * the page loaded – `start()` (main.ts) keeps it so the Info page can show the browser's install dialog
 * later. Chrome's own install banner stays on as well (Tilman 2026-09-27). iOS has no such dialog: readers use Share → "Add to Home Screen" (the Info page explains it).
 */

/** Chromium's install prompt event (not in the DOM typings) */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * How this device installs the app:
 * - `installed`: running from the home screen already
 * - `prompt`: the browser's own install dialog is available
 * - `ios`: Safari's Share → "Add to Home Screen"
 * - `manual`: other browsers – their menu, if they support it at all
 */
export type InstallMethod = "installed" | "prompt" | "ios" | "manual";

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

  /** Keep the browser's install prompt for later (call once at startup, before the event fires) */
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
    if (this.installed || this.isStandalone()) return "installed";
    if (this.deferredPrompt) return "prompt";
    return isIOS() ? "ios" : "manual";
  }

  /** Shows the browser's install dialog (a prompt can be used once); true when the reader accepted */
  async prompt(): Promise<boolean> {
    const event = this.deferredPrompt;
    if (!event) return false;
    this.deferredPrompt = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    this.notify();
    return outcome === "accepted";
  }

  /** Called when the method may have changed; returns the unsubscribe function */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private isStandalone(): boolean {
    return window.matchMedia?.("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }

  private notify(): void {
    this.listeners.forEach(listener => listener());
  }
}
