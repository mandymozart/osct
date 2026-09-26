import { afterEach, describe, expect, it, vi } from "vitest";
import { CAMERA_NOT_RESPONDING } from "@/types";

// The tracking engine (TF.js) is not needed to start the camera
vi.mock("@/vendor/mind-ar/mindar-image.prod.js", () => ({ Controller: class {} }));
const { CAMERA_START_TIMEOUT_MS, ImageTracker } = await import("../tracker");

describe("ImageTracker camera start", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("gives up when the camera sends no picture, and releases the stream", async () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    // happy-dom's video does not take a MediaStream; no loadedmetadata ever comes (the stuck camera)
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", { configurable: true, get: () => null, set: () => {} });

    const container = document.createElement("div");
    const tracker = new ImageTracker(container, { maxTrack: 1, onUpdate: () => {} });
    const start = tracker.startCamera();
    const result = expect(start).rejects.toThrow(CAMERA_NOT_RESPONDING);
    await vi.advanceTimersByTimeAsync(CAMERA_START_TIMEOUT_MS);
    await result;
    expect(tracker.hasCamera).toBe(false);
    expect(container.querySelector("video")).toBeNull();
  });
});
