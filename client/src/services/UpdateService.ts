/**
 * A new version under an open reader (#231): the browser looks for a new service worker only on a navigation, and an
 * open reader – a single-page app, or the installed app left open on a phone – never navigates. So the service asks
 * for one itself (`registration.update()`) whenever the tab becomes visible and on a slow interval. The worker skips
 * waiting and claims every open page (sw/service-worker.ts), so a deploy reaches an open page as `controllerchange`;
 * the page then asks the new worker for its build (sw/build-query.ts) and is out of date when it is another one. A
 * code file of the running build that fails to load (a lazy chunk the deploy removed: `vite:preloadError`, a rejected
 * dynamic import nobody handled, or the AR chunk – `reportStaleCode()`) means the same.
 *
 * It only tells: `<new-version-notice>` offers the reload at a calm moment. Nothing here reloads by itself.
 */

/** Called each time the page learns it runs out-of-date code (a takeover, a failed code file) */
export type UpdateListener = () => void;

/** How often an open, visible reader asks for a new worker */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
/** A quick return to the tab asks again only after this long */
export const UPDATE_CHECK_MIN_GAP_MS = 60 * 1000;
/** How long the page waits for a new worker to name its build; no answer counts as another build */
export const BUILD_ANSWER_TIMEOUT_MS = 3000;

/** The worker's build query (sw/build-query.ts – the same message type) */
const BUILD_QUERY = "osct-build";

/** A dynamic import's failure as the browsers word it (Chromium, Firefox, Safari) or Vite's preload of its CSS */
const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

/** The reason is a code file that could not be loaded */
export const isChunkLoadError = (reason: unknown): boolean =>
  CHUNK_ERROR.test(reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "");

/** What `watch` needs of `navigator.serviceWorker` (a test passes its own) */
export type WorkerContainer = Pick<ServiceWorkerContainer, "controller" | "addEventListener" | "removeEventListener">;

export class UpdateService {
  private static instance: UpdateService | null = null;
  private outdated = false;
  private listeners = new Set<UpdateListener>();

  static getInstance(): UpdateService {
    if (!UpdateService.instance) UpdateService.instance = new UpdateService();
    return UpdateService.instance;
  }

  /** The page runs out-of-date code: a new version took over, or one of its code files could not be loaded */
  get isOutdated(): boolean {
    return this.outdated;
  }

  /** Listen for out-of-date code; returns the remover */
  subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * A code file of the running build could not be loaded (the AR chunk: `<ar-bridge>`). Offline that is the connection,
   * not a deploy – nothing is reported then.
   */
  reportStaleCode(): void {
    if (navigator.onLine === false) return;
    this.markOutdated();
  }

  /** Report code files that fail to load (call once at startup); returns the remover */
  noticeStaleChunks(win: Window = window): () => void {
    const onPreloadError = () => this.reportStaleCode();
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) this.reportStaleCode();
    };
    win.addEventListener("vite:preloadError", onPreloadError);
    win.addEventListener("unhandledrejection", onRejection);
    return () => {
      win.removeEventListener("vite:preloadError", onPreloadError);
      win.removeEventListener("unhandledrejection", onRejection);
    };
  }

  /**
   * Ask for a new worker when the tab becomes visible and every `UPDATE_CHECK_INTERVAL_MS` while it is (never more
   * often than `UPDATE_CHECK_MIN_GAP_MS`), and compare the build of every worker that takes the page over with
   * `build`, the page's own. Returns the remover.
   */
  watch(registration: Pick<ServiceWorkerRegistration, "update">, container: WorkerContainer = navigator.serviceWorker,
    build: string = __VITE_BUILD_DATE__, doc: Document = document): () => void {
    // The page was just loaded – the navigation asked for a new worker already
    let lastCheck = Date.now();
    const check = () => {
      if (doc.visibilityState !== "visible" || Date.now() - lastCheck < UPDATE_CHECK_MIN_GAP_MS) return;
      lastCheck = Date.now();
      try {
        registration.update().catch(() => undefined); // offline: the next check asks again
      } catch {
        // a registration being removed throws at once – nothing to update
      }
    };
    const onControllerChange = () => {
      const worker = container.controller;
      if (!worker) return;
      void askBuild(worker).then(answer => {
        if (answer !== build) this.markOutdated();
      });
    };
    const timer = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    doc.addEventListener("visibilitychange", check);
    container.addEventListener("controllerchange", onControllerChange);
    return () => {
      window.clearInterval(timer);
      doc.removeEventListener("visibilitychange", check);
      container.removeEventListener("controllerchange", onControllerChange);
    };
  }

  /** Load the new version (the reader's choice – the notice's *Reload*) */
  reload(): void {
    window.location.reload();
  }

  private markOutdated(): void {
    this.outdated = true;
    this.listeners.forEach(listener => listener());
  }
}

/** The build a worker serves (`null`: no answer in time – a worker without the query) */
const askBuild = (worker: ServiceWorker): Promise<string | null> =>
  new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => done(null), BUILD_ANSWER_TIMEOUT_MS);
    const done = (answer: string | null) => {
      window.clearTimeout(timer);
      channel.port1.close();
      resolve(answer);
    };
    channel.port1.onmessage = event => done(typeof event.data === "string" ? event.data : null);
    worker.postMessage({ type: BUILD_QUERY }, [channel.port2]);
  });
