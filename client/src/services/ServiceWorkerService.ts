/**
 * Registers the service worker (PWA: installable app, app shell and seen content offline –
 * `sw/service-worker.ts`). Production builds only: the dev server has no worker (vite-plugin-pwa builds it
 * with `vite build`), so `npm run dev` always serves fresh files. Registered after the page has loaded,
 * so the worker's precache download never competes with the first paint.
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
