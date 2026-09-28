/**
 * Registers the service worker (`sw/service-worker.ts`: installable app, offline app shell and seen content).
 * Production builds only: vite-plugin-pwa builds the worker with `vite build`, so `npm run dev` always serves
 * fresh files. Registration waits for the page's load event so the precache download never competes with
 * the first paint.
 */
export class ServiceWorkerService {
  static readonly URL = "/service-worker.js";

  static register(): void {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register(ServiceWorkerService.URL, { scope: "/" })
      .catch(error => console.warn("[ServiceWorkerService] Registration failed:", error));
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });
  }
}
