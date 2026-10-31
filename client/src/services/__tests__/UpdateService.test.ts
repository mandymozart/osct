import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILD_ANSWER_TIMEOUT_MS, UPDATE_CHECK_INTERVAL_MS, UPDATE_CHECK_MIN_GAP_MS, UpdateService, isChunkLoadError } from "../UpdateService";
import { answerBuildQuery } from "../../../sw/build-query";

/** A message port pair that delivers at once: port2's postMessage reaches port1's onmessage */
class FakeChannel {
  port1 = { onmessage: null as ((event: { data: unknown }) => void) | null, close: vi.fn() };
  port2 = { postMessage: (data: unknown) => this.port1.onmessage?.({ data }) };
}

/** `navigator.serviceWorker` with a controller that answers the build query like the worker does (null: no answer) */
const container = (answer: string | null) => {
  const listeners = new Set<() => void>();
  const controller = {
    postMessage: vi.fn((data: unknown, ports: MessagePort[]) => {
      if (answer !== null) answerBuildQuery(data, ports, answer);
    }),
  };
  return {
    controller: controller as unknown as ServiceWorker | null,
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    /** Another worker took the page over */
    takeOver: () => listeners.forEach(listener => listener()),
    listeners,
  };
};

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("UpdateService", () => {
  let service: UpdateService;
  let changes: number;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("MessageChannel", FakeChannel);
    service = new UpdateService();
    changes = 0;
    service.subscribe(() => changes++);
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("asks for a new worker", () => {
    const watch = () => {
      const registration = { update: vi.fn().mockResolvedValue(undefined) };
      const stop = service.watch(registration, container("build-a"), "build-a");
      return { registration, stop };
    };

    it("when the tab becomes visible – not right after the page loaded, and not more often than the gap", () => {
      const { registration } = watch();
      setVisibility("visible");
      expect(registration.update).not.toHaveBeenCalled();

      vi.advanceTimersByTime(UPDATE_CHECK_MIN_GAP_MS);
      setVisibility("hidden");
      expect(registration.update).not.toHaveBeenCalled();
      setVisibility("visible");
      expect(registration.update).toHaveBeenCalledTimes(1);

      setVisibility("visible");
      expect(registration.update).toHaveBeenCalledTimes(1);
    });

    it("on the slow interval while the tab is visible, never while it is hidden", () => {
      const { registration } = watch();
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
      expect(registration.update).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
      expect(registration.update).toHaveBeenCalledTimes(1);
    });

    it("offline: a failed check is swallowed and the next one asks again", async () => {
      const registration = { update: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) };
      service.watch(registration, container("build-a"), "build-a");
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
      await Promise.resolve();
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
      expect(registration.update).toHaveBeenCalledTimes(2);
      expect(service.isOutdated).toBe(false);
    });

    it("stops asking once removed", () => {
      const { registration, stop } = watch();
      stop();
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 2);
      setVisibility("visible");
      expect(registration.update).not.toHaveBeenCalled();
    });
  });

  describe("a worker takes the page over", () => {
    it("from another build: the page is out of date", async () => {
      const worker = container("build-b");
      service.watch({ update: vi.fn() }, worker, "build-a");
      worker.takeOver();
      await vi.advanceTimersByTimeAsync(BUILD_ANSWER_TIMEOUT_MS);
      expect(worker.controller!.postMessage).toHaveBeenCalledWith({ type: "osct-build" }, expect.any(Array));
      expect(service.isOutdated).toBe(true);
      expect(changes).toBe(1);
    });

    it("from the page's own build (the page was opened after the deploy, the old worker still controlled it): nothing", async () => {
      const worker = container("build-a");
      service.watch({ update: vi.fn() }, worker, "build-a");
      worker.takeOver();
      await vi.advanceTimersByTimeAsync(BUILD_ANSWER_TIMEOUT_MS);
      expect(service.isOutdated).toBe(false);
      expect(changes).toBe(0);
    });

    it("a worker that does not answer counts as another build, after the timeout", async () => {
      const worker = container(null);
      service.watch({ update: vi.fn() }, worker, "build-a");
      worker.takeOver();
      await vi.advanceTimersByTimeAsync(BUILD_ANSWER_TIMEOUT_MS - 1);
      expect(service.isOutdated).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(service.isOutdated).toBe(true);
    });

    it("no controller after the change (the worker went away): nothing", async () => {
      const worker = container("build-b");
      worker.controller = null;
      service.watch({ update: vi.fn() }, worker, "build-a");
      worker.takeOver();
      await vi.advanceTimersByTimeAsync(BUILD_ANSWER_TIMEOUT_MS);
      expect(service.isOutdated).toBe(false);
    });
  });

  describe("a code file that fails to load", () => {
    it("Vite's preload error and an unhandled failed dynamic import report it; other rejections do not", () => {
      const stop = service.noticeStaleChunks(window);
      const rejection = (reason: unknown) => {
        const event = new Event("unhandledrejection") as PromiseRejectionEvent;
        Object.defineProperty(event, "reason", { value: reason });
        window.dispatchEvent(event);
      };
      rejection(new Error("Something else broke"));
      expect(service.isOutdated).toBe(false);

      rejection(new TypeError("Failed to fetch dynamically imported module: https://osct.example/assets/app/index-abc.js"));
      expect(service.isOutdated).toBe(true);
      window.dispatchEvent(new Event("vite:preloadError"));
      expect(changes).toBe(2);

      stop();
      window.dispatchEvent(new Event("vite:preloadError"));
      expect(changes).toBe(2);
    });

    it("the AR chunk (reported by the bridge) – but not while offline, where the connection is the reason", () => {
      vi.stubGlobal("navigator", { ...navigator, onLine: false });
      service.reportStaleCode();
      expect(service.isOutdated).toBe(false);
      vi.stubGlobal("navigator", { ...navigator, onLine: true });
      service.reportStaleCode();
      expect(service.isOutdated).toBe(true);
    });

    it("knows how the browsers word a failed dynamic import", () => {
      expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /a.js"))).toBe(true);
      expect(isChunkLoadError(new TypeError("error loading dynamically imported module: /a.js"))).toBe(true);
      expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
      expect(isChunkLoadError("Unable to preload CSS for /assets/app/a.css")).toBe(true);
      expect(isChunkLoadError(new Error("Network error"))).toBe(false);
      expect(isChunkLoadError(undefined)).toBe(false);
    });
  });

  it("the worker answers only its build query, on the port the page sent", () => {
    const port = { postMessage: vi.fn() } as unknown as MessagePort;
    expect(answerBuildQuery({ type: "other" }, [port], "build-a")).toBe(false);
    expect(answerBuildQuery({ type: "osct-build" }, [], "build-a")).toBe(false);
    expect(answerBuildQuery({ type: "osct-build" }, [port], "build-a")).toBe(true);
    expect(port.postMessage).toHaveBeenCalledWith("build-a");
  });
});
