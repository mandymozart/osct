import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCameraDefaults, asksForBackCamera, focusAtTap, TAP_FOCUS_MS, tapToFramePoint, CAMERA_RESOLUTIONS, getCameraResolution, getLensChoice, mainBackLens, releaseCameraRequest, rewriteCameraRequest, setAskZoom, setCameraResolution, setLensChoice,
  wrapCameraRequest,
} from "../camera-request";

const camera = (deviceId: string, label: string) => ({ kind: "videoinput", deviceId, label }) as MediaDeviceInfo;
/** The cameras of a Galaxy S22 as Chromium 155 lists them: back 0 = main lens, back 2 = ultra-wide (fixed focus) */
const S22 = [camera("front3", "camera 3, facing front"), camera("ultra", "camera 2, facing back"), camera("main", "camera 0, facing back"), camera("front1", "camera 1, facing front")];
/** The engine's first camera request on Android */
const ENGINE_REQUEST = { video: { width: { exact: 960 }, height: { exact: 720 }, facingMode: { exact: "environment" } } };

const ANDROID = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.6 Mobile/15E148 Safari/604.1";

const stubDevices = (lists: MediaDeviceInfo[][], userAgent = ANDROID) => {
  const getUserMedia = vi.fn(async (_constraints?: MediaStreamConstraints) => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream);
  const enumerateDevices = vi.fn(async () => lists.length > 1 ? lists.shift()! : lists[0]);
  vi.stubGlobal("navigator", { ...navigator, userAgent, mediaDevices: { getUserMedia, enumerateDevices } });
  return { getUserMedia, enumerateDevices };
};

describe("camera request", () => {
  afterEach(() => {
    releaseCameraRequest();
    setAskZoom(false);
    setLensChoice("main");
    setCameraResolution(null);
    vi.unstubAllGlobals();
  });

  it("sets continuous focus at start where the camera offers it and does not use it; leaves fixed-focus lenses", async () => {
    const track = (modes: string[] | undefined, mode: string, fail = false) => {
      const applyConstraints = vi.fn(async () => { if (fail) throw new Error("OverconstrainedError"); });
      return { applyConstraints, track: { getCapabilities: () => ({ focusMode: modes }), getSettings: () => ({ focusMode: mode }), applyConstraints } as unknown as MediaStreamTrack };
    };
    const manual = track(["manual", "single-shot", "continuous"], "manual");
    await applyCameraDefaults(manual.track);
    expect(manual.applyConstraints).toHaveBeenCalledWith({ advanced: [{ focusMode: "continuous" }] });
    const already = track(["manual", "continuous"], "continuous");
    await applyCameraDefaults(already.track);
    expect(already.applyConstraints).not.toHaveBeenCalled();
    const ultraWide = track(["manual"], "continuous");
    await applyCameraDefaults(ultraWide.track);
    expect(ultraWide.applyConstraints).not.toHaveBeenCalled();
    const safari = track(undefined, "");
    await applyCameraDefaults(safari.track);
    expect(safari.applyConstraints).not.toHaveBeenCalled();
    const refused = track(["continuous"], "manual", true);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(applyCameraDefaults(refused.track)).resolves.toBeUndefined();
  });

  it("finds Android's main back lens in the current and the old label, nothing on iOS or desktop", () => {
    expect(mainBackLens(S22)).toBe("main");
    expect(mainBackLens([camera("old", "camera2 0, facing back")])).toBe("old");
    expect(mainBackLens([camera("ios", "Back Camera"), camera("ios-wide", "Back Ultra Wide Camera")])).toBeNull();
    expect(mainBackLens([camera("cam", "Integrated Webcam (0c45:6a1b)")])).toBeNull();
  });

  it("only a back-camera request without a device is changed", () => {
    expect(asksForBackCamera(ENGINE_REQUEST)).toBe(true);
    expect(asksForBackCamera({ video: { facingMode: "environment" } })).toBe(true);
    expect(asksForBackCamera({ video: { facingMode: ["environment"] } })).toBe(true);
    expect(asksForBackCamera({ video: { facingMode: { ideal: "environment" } } })).toBe(true);
    expect(asksForBackCamera({ video: { facingMode: { exact: "user" } } })).toBe(false);
    expect(asksForBackCamera({ video: { deviceId: { exact: "x" }, facingMode: "environment" } })).toBe(false);
    expect(asksForBackCamera({ video: true })).toBe(false);
    expect(asksForBackCamera({ audio: true })).toBe(false);
  });

  it("rewrites the request: the lens instead of the facing mode, the zoom request", () => {
    expect(rewriteCameraRequest(ENGINE_REQUEST, { deviceId: "main" })).toEqual({ video: { width: { exact: 960 }, height: { exact: 720 }, deviceId: { exact: "main" } } });
    expect(ENGINE_REQUEST.video.facingMode).toEqual({ exact: "environment" });
    expect(rewriteCameraRequest({ video: true }, { zoom: true })).toEqual({ video: { zoom: true } });
    expect(rewriteCameraRequest({ video: { width: { exact: 960 } }, audio: false }, { zoom: true })).toEqual({ video: { width: { exact: 960 }, zoom: true }, audio: false });
    expect(rewriteCameraRequest({ audio: true }, { deviceId: "main", zoom: true })).toEqual({ audio: true });
  });

  it("the engine's request opens the main back lens; the lens switch leaves it to the browser", async () => {
    const { getUserMedia } = stubDevices([S22]);
    wrapCameraRequest();
    await navigator.mediaDevices.getUserMedia(ENGINE_REQUEST);
    expect(getUserMedia).toHaveBeenLastCalledWith({ video: { width: { exact: 960 }, height: { exact: 720 }, deviceId: { exact: "main" } } });

    setLensChoice("browser");
    expect(getLensChoice()).toBe("browser");
    await navigator.mediaDevices.getUserMedia(ENGINE_REQUEST);
    expect(getUserMedia).toHaveBeenLastCalledWith(ENGINE_REQUEST);

    releaseCameraRequest();
    expect(navigator.mediaDevices.getUserMedia).toBe(getUserMedia);
  });

  it("without labels (camera not allowed yet) the camera is opened once to list them", async () => {
    const unlabelled = S22.map(device => ({ ...device, label: "" }) as MediaDeviceInfo);
    const { getUserMedia } = stubDevices([unlabelled, S22]);
    wrapCameraRequest();
    await navigator.mediaDevices.getUserMedia(ENGINE_REQUEST);
    expect(getUserMedia).toHaveBeenNthCalledWith(1, { video: true });
    expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ video: expect.objectContaining({ deviceId: { exact: "main" } }) }));
  });

  it("iOS: the cameras are not listed (no extra camera start), the request stays; ask for zoom adds zoom", async () => {
    const { getUserMedia, enumerateDevices } = stubDevices([[camera("ios", "")]], IPHONE);
    wrapCameraRequest();
    await navigator.mediaDevices.getUserMedia(ENGINE_REQUEST);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenLastCalledWith(ENGINE_REQUEST);
    expect(enumerateDevices).not.toHaveBeenCalled();

    setAskZoom(true);
    await navigator.mediaDevices.getUserMedia({ video: { facingMode: ["environment"] } });
    expect(getUserMedia).toHaveBeenLastCalledWith({ video: { facingMode: ["environment"], zoom: true } });
  });

  it("a chosen size replaces the engine's exact 960 × 720 (as ideal); unset leaves it", async () => {
    expect(getCameraResolution()).toBeNull();
    const { getUserMedia } = stubDevices([S22]);
    wrapCameraRequest();
    setCameraResolution(CAMERA_RESOLUTIONS[2]);
    expect(getCameraResolution()).toEqual({ width: 1920, height: 1440 });
    await navigator.mediaDevices.getUserMedia(ENGINE_REQUEST);
    expect(getUserMedia).toHaveBeenLastCalledWith({ video: { width: { ideal: 1920 }, height: { ideal: 1440 }, deviceId: { exact: "main" } } });
    // a request without a size (the label check) keeps none
    expect(rewriteCameraRequest({ video: true }, { resolution: CAMERA_RESOLUTIONS[1] })).toEqual({ video: {} });
  });

  it("maps a tap through the cover crop, with the frame turned to the screen", () => {
    // 960 × 720 frame shown 720 × 960 on a 360 × 800 portrait screen: scaled by 0.833 to 600 × 800, 120 px cut off left and right
    expect(tapToFramePoint(180, 400, 360, 800, 960, 720)).toEqual({ x: 0.5, y: 0.5 });
    const left = tapToFramePoint(0, 0, 360, 800, 960, 720);
    expect(left.x).toBeCloseTo(120 / 600);
    expect(left.y).toBe(0);
  });

  it("tap to focus: one focus run at the tapped point, then continuous again; a newer tap takes over", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("innerWidth", 360);
    vi.stubGlobal("innerHeight", 800);
    const applyConstraints = vi.fn(async () => {});
    const track = {
      readyState: "live", applyConstraints,
      getCapabilities: () => ({ focusMode: ["manual", "single-shot", "continuous"], pointsOfInterest: true }),
      getSettings: () => ({ focusMode: "continuous", width: 960, height: 720 }),
    } as unknown as MediaStreamTrack;
    expect(await focusAtTap(180, 400)).toBe(false); // no camera yet
    await applyCameraDefaults(track);
    expect(await focusAtTap(180, 400)).toBe(true);
    expect(applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ pointsOfInterest: [{ x: 0.5, y: 0.5 }], focusMode: "single-shot" }] });
    await focusAtTap(10, 10);
    vi.advanceTimersByTime(TAP_FOCUS_MS);
    // only the newer tap's run goes back to continuous
    expect(applyConstraints.mock.calls.filter(call => JSON.stringify(call).includes("\"continuous\"") && !JSON.stringify(call).includes("single-shot"))).toHaveLength(1);
    expect(applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ focusMode: "continuous" }] });
    releaseCameraRequest();
    expect(await focusAtTap(180, 400)).toBe(false);
    vi.useRealTimers();
  });

  it("tap to focus without points of interest (Chrome on the S22) refocuses the picture; Safari ignores it", async () => {
    const applyConstraints = vi.fn(async () => {});
    const camera = (capabilities: Record<string, unknown>) => ({
      readyState: "live", applyConstraints, getCapabilities: () => capabilities, getSettings: () => ({ focusMode: "continuous" }),
    } as unknown as MediaStreamTrack);
    await applyCameraDefaults(camera({ focusMode: ["manual", "single-shot", "continuous"] }));
    expect(await focusAtTap(100, 100)).toBe(true);
    expect(applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ focusMode: "single-shot" }] });
    applyConstraints.mockClear();
    await applyCameraDefaults(camera({}));
    expect(await focusAtTap(100, 100)).toBe(false);
    expect(applyConstraints).not.toHaveBeenCalled();
  });
});
