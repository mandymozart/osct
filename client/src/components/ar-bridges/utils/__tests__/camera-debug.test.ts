import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyContinuousFocus, armTapToFocus, cameraLine, cameraSummary, cycleZoom, getCameraInfo, releaseZoomRequest,
  requestZoomOnCameraStart, setAskZoom, setCameraTrack, subscribeCamera, tapToFramePoint, withZoomRequest, zoomSteps,
} from "../camera-debug";

/** A camera track like Chrome on Android reports it (Image Capture constraints) */
const fakeTrack = (overrides: { capabilities?: Record<string, unknown>; settings?: Record<string, unknown>; fail?: boolean } = {}) => {
  const settings: Record<string, unknown> = { width: 960, height: 720, frameRate: 30, focusMode: "continuous", focusDistance: 0.2, zoom: 1, ...overrides.settings };
  const capabilities = {
    focusMode: ["manual", "single-shot", "continuous"], focusDistance: { min: 0.1, max: 10, step: 0.01 },
    zoom: { min: 1, max: 8, step: 0.1 }, pointsOfInterest: true, ...overrides.capabilities,
  };
  const applyConstraints = vi.fn(async (constraints: { advanced: Record<string, unknown>[] }) => {
    if (overrides.fail) throw new Error("OverconstrainedError");
    Object.assign(settings, constraints.advanced[0]);
  });
  const track = { label: "camera2 0, facing back", getSettings: () => ({ ...settings }), getCapabilities: () => capabilities, applyConstraints };
  return { track: track as unknown as MediaStreamTrack, applyConstraints, settings };
};

describe("camera debug", () => {
  afterEach(() => {
    setCameraTrack(null);
    setAskZoom(false);
    releaseZoomRequest();
    vi.unstubAllGlobals();
  });

  it("reads lens, resolution, focus and zoom from the engine's track, and nothing without one", () => {
    expect(getCameraInfo()).toBeNull();
    const seen: unknown[] = [];
    const unsubscribe = subscribeCamera(info => seen.push(info));
    setCameraTrack(fakeTrack().track);
    expect(getCameraInfo()).toMatchObject({
      label: "camera2 0, facing back", width: 960, height: 720, frameRate: 30,
      focusMode: "continuous", focusModes: ["manual", "single-shot", "continuous"], focusDistance: 0.2,
      focusRange: { min: 0.1, max: 10, step: 0.01 }, zoom: 1, zoomRange: { min: 1, max: 8, step: 0.1 }, pointsOfInterest: true,
    });
    expect(cameraSummary()).toBe("C0 960×720 cont 0.20m 1×");
    expect(cameraLine()).toBe("camera2 0, facing back · 960×720 · focus continuous 0.20 m · range 0.1–10 m · zoom 1× (1–8)");
    setCameraTrack(null);
    expect(seen).toHaveLength(2);
    expect(seen.at(-1)).toBeNull();
    unsubscribe();
  });

  it("a camera without focus or zoom (Safari) still reads, and the switches say what is missing", async () => {
    const { track } = fakeTrack({ capabilities: { focusMode: undefined, focusDistance: undefined, zoom: undefined, pointsOfInterest: undefined }, settings: { focusMode: undefined, focusDistance: undefined, zoom: undefined } });
    setCameraTrack(track);
    expect(getCameraInfo()).toMatchObject({ focusMode: null, focusModes: [], focusRange: null, zoom: null, zoomRange: null });
    expect(cameraSummary()).toBe("C0 960×720 f?");
    expect(await cycleZoom()).toBe("zoom not offered – try “ask for zoom”");
  });

  it("test switches: continuous focus, zoom steps within the lens's range, and the browser's refusal", async () => {
    const { track, applyConstraints } = fakeTrack({ settings: { focusMode: "manual" }, capabilities: { zoom: { min: 1, max: 2 } } });
    setCameraTrack(track);
    expect(await applyContinuousFocus()).toBe("continuous focus applied");
    expect(applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ focusMode: "continuous" }] });
    expect(getCameraInfo()?.focusMode).toBe("continuous");

    expect(zoomSteps()).toEqual([1, 1.5, 2]);
    expect(await cycleZoom()).toBe("zoom 1.5× applied");
    expect(await cycleZoom()).toBe("zoom 2× applied");
    expect(await cycleZoom()).toBe("zoom 1× applied");

    setCameraTrack(fakeTrack({ fail: true }).track);
    expect(await cycleZoom()).toBe("zoom failed: OverconstrainedError");
    expect(getCameraInfo()?.lastAction).toBe("zoom failed: OverconstrainedError");
  });

  it("tap to focus: the next tap on the picture focuses there, taps on the debug UI do not", async () => {
    const { track, applyConstraints } = fakeTrack();
    setCameraTrack(track);
    vi.stubGlobal("innerWidth", 360);
    vi.stubGlobal("innerHeight", 800);
    armTapToFocus();
    expect(getCameraInfo()?.tapArmed).toBe(true);

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, clientX: 10, clientY: 10 }));
    expect(applyConstraints).not.toHaveBeenCalled();
    button.remove();

    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 180, clientY: 400 }));
    await vi.waitFor(() => expect(applyConstraints).toHaveBeenCalled());
    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ pointsOfInterest: [{ x: 0.5, y: 0.5 }], focusMode: "single-shot" }] });
    expect(getCameraInfo()?.tapArmed).toBe(false);
  });

  it("maps a tap through the cover crop, with the frame turned to the screen", () => {
    // 960 × 720 frame shown 720 × 960 on a 360 × 800 portrait screen: scaled by 0.833 to 600 × 800, 120 px cut off left and right
    expect(tapToFramePoint(180, 400, 360, 800, 960, 720)).toEqual({ x: 0.5, y: 0.5 });
    const left = tapToFramePoint(0, 0, 360, 800, 960, 720);
    expect(left.x).toBeCloseTo(120 / 600);
    expect(left.y).toBe(0);
  });

  it("ask for zoom: the camera request on start gets zoom, only while it is on, and is restored", async () => {
    expect(withZoomRequest({ video: true })).toEqual({ video: { zoom: true } });
    expect(withZoomRequest({ video: { width: { exact: 960 } }, audio: false })).toEqual({ video: { width: { exact: 960 }, zoom: true }, audio: false });
    expect(withZoomRequest({ audio: true })).toEqual({ audio: true });

    const getUserMedia = vi.fn(async (_constraints?: MediaStreamConstraints) => ({}) as MediaStream);
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    requestZoomOnCameraStart(); // off: unchanged
    expect(navigator.mediaDevices.getUserMedia).toBe(getUserMedia);

    setAskZoom(true);
    requestZoomOnCameraStart();
    await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: "environment" } } });
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { exact: "environment" }, zoom: true } });
    releaseZoomRequest();
    expect(navigator.mediaDevices.getUserMedia).toBe(getUserMedia);
  });
});
