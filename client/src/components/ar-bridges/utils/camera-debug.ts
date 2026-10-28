/**
 * Debug view and test controls of the AR camera (three-free, main chunk): which lens the engine opened, at what
 * resolution, how it focuses and zooms – and test switches for continuous focus, tap to focus and zoom.
 * The tracker hands over the engine's camera track (`setCameraTrack()`); the debug overlay and the trial panel read
 * and drive it. Nothing in the app depends on it.
 *
 * Why (trigger test 2026-10-28, `docs/trigger-tests/`): small printed triggers were missed and the camera seemed not
 * to focus. The engine sets no focus mode and no zoom – the browser's default applies. Focus and zoom are
 * `MediaStreamTrack` constraints (Image Capture extensions): Chrome on Android has `focusMode`, `focusDistance`,
 * `pointsOfInterest` and `zoom` (zoom may need the camera's pan-tilt-zoom permission, `setAskZoom()`); Safari on iOS
 * reports little or none of it. Zoom changes the field of view the engine assumes: finding a target works, the AR
 * overlay may sit slightly off while zoomed.
 */

export interface CameraRange {
  min: number;
  max: number;
  step?: number;
}

export interface CameraInfo {
  /** The lens as the browser names it, e.g. "camera2 0, facing back" */
  label: string;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  /** The focus mode in use (continuous, single-shot, manual, none), null = not reported */
  focusMode: string | null;
  focusModes: string[];
  /** Current focus distance in metres (as the browser reports it), and the lens's range */
  focusDistance: number | null;
  focusRange: CameraRange | null;
  zoom: number | null;
  zoomRange: CameraRange | null;
  /** The browser can focus on a point (tap to focus) */
  pointsOfInterest: boolean;
  /** The next tap on the camera picture focuses there */
  tapArmed: boolean;
  /** The outcome of the last test switch, e.g. "zoom 2× applied" or the browser's error */
  lastAction: string | null;
}

/** Zoom steps of the test switch (only those within the lens's range) */
export const ZOOM_STEPS = [1, 1.5, 2, 3];
/** How often the readout re-reads the camera (focus distance and mode change while it runs) */
const REFRESH_MS = 1000;
const ASK_ZOOM_KEY = "osct-camera-ask-zoom";

type LooseRecord = Record<string, unknown>;

let track: MediaStreamTrack | null = null;
let info: CameraInfo | null = null;
let tapArmed = false;
let lastAction: string | null = null;
let refreshTimer: number | null = null;
const listeners = new Set<(info: CameraInfo | null) => void>();

const numberOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

const rangeOf = (value: unknown): CameraRange | null => {
  if (!value || typeof value !== "object") return null;
  const { min, max, step } = value as LooseRecord;
  if (typeof min !== "number" || typeof max !== "number") return null;
  return { min, max, ...(typeof step === "number" ? { step } : {}) };
};

const read = (): CameraInfo | null => {
  if (!track) return null;
  const settings = (track.getSettings?.() ?? {}) as LooseRecord;
  const capabilities = (track.getCapabilities?.() ?? {}) as LooseRecord;
  return {
    label: track.label || "(no label)",
    width: numberOrNull(settings.width),
    height: numberOrNull(settings.height),
    frameRate: numberOrNull(settings.frameRate),
    focusMode: typeof settings.focusMode === "string" ? settings.focusMode : null,
    focusModes: Array.isArray(capabilities.focusMode) ? capabilities.focusMode.map(String) : [],
    focusDistance: numberOrNull(settings.focusDistance),
    focusRange: rangeOf(capabilities.focusDistance),
    zoom: numberOrNull(settings.zoom),
    zoomRange: rangeOf(capabilities.zoom),
    pointsOfInterest: "pointsOfInterest" in capabilities || "pointsOfInterest" in settings,
    tapArmed,
    lastAction,
  };
};

/** Re-reads the camera and tells the listeners when something changed */
export const refreshCamera = (): void => {
  const next = read();
  if (JSON.stringify(next) === JSON.stringify(info)) return;
  info = next;
  listeners.forEach(listener => listener(info));
};

/** The tracker hands over the engine's camera track when the stream starts, null when it stops */
export const setCameraTrack = (next: MediaStreamTrack | null): void => {
  if (next === track) return;
  track = next;
  tapArmed = false;
  lastAction = null;
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
  refreshTimer = next ? window.setInterval(refreshCamera, REFRESH_MS) : null;
  refreshCamera();
};

export const getCameraInfo = (): CameraInfo | null => info;

export const subscribeCamera = (listener: (info: CameraInfo | null) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const apply = async (constraints: LooseRecord, done: string): Promise<string> => {
  if (!track) return (lastAction = "no camera");
  try {
    await track.applyConstraints({ advanced: [constraints] } as MediaTrackConstraints);
    lastAction = done;
  } catch (error) {
    lastAction = `${done.split(" ")[0]} failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  refreshCamera();
  return lastAction;
};

/** Test switch: continuous autofocus */
export const applyContinuousFocus = (): Promise<string> => {
  if (info && info.focusModes.length && !info.focusModes.includes("continuous")) {
    lastAction = `continuous focus not offered (${info.focusModes.join(", ")})`;
    refreshCamera();
    return Promise.resolve(lastAction);
  }
  return apply({ focusMode: "continuous" }, "continuous focus applied");
};

/** Focus once on a point of the picture (0–1 from the top left of the camera frame) */
export const focusAt = (x: number, y: number): Promise<string> => {
  const point = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  const mode = info?.focusModes.includes("single-shot") ? { focusMode: "single-shot" } : {};
  return apply({ pointsOfInterest: [point], ...mode }, `focus at ${point.x.toFixed(2)}, ${point.y.toFixed(2)} applied`);
};

/** The zoom steps the lens offers */
export const zoomSteps = (range: CameraRange | null = info?.zoomRange ?? null): number[] =>
  range ? ZOOM_STEPS.filter(step => step >= range.min && step <= range.max) : [];

export const setZoom = (zoom: number): Promise<string> => apply({ zoom }, `zoom ${zoom}× applied`);

/** Test switch: the next zoom step (after the last one back to the first) */
export const cycleZoom = (): Promise<string> => {
  const steps = zoomSteps();
  if (!steps.length) {
    lastAction = getAskZoom() ? "zoom not offered by this camera" : "zoom not offered – try “ask for zoom”";
    refreshCamera();
    return Promise.resolve(lastAction);
  }
  const current = info?.zoom ?? steps[0];
  const next = steps.find(step => step > current + 0.01) ?? steps[0];
  return setZoom(next);
};

/**
 * Maps a tap on the screen to the camera frame: the picture fills the screen and is cropped like `object-fit:
 * cover`; the frame is turned to the screen's orientation (a 960 × 720 frame is shown 720 × 960 in portrait).
 */
export const tapToFramePoint = (
  tapX: number, tapY: number, viewWidth: number, viewHeight: number, frameWidth: number, frameHeight: number,
): { x: number; y: number } => {
  const portraitView = viewHeight > viewWidth;
  const [shownWidth, shownHeight] = portraitView === frameHeight > frameWidth ? [frameWidth, frameHeight] : [frameHeight, frameWidth];
  const scale = Math.max(viewWidth / shownWidth, viewHeight / shownHeight);
  const x = (tapX - (viewWidth - shownWidth * scale) / 2) / (shownWidth * scale);
  const y = (tapY - (viewHeight - shownHeight * scale) / 2) / (shownHeight * scale);
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
};

/** Taps on these are UI, not the camera picture */
const isUi = (event: PointerEvent): boolean =>
  event.composedPath().some(el => el instanceof HTMLElement &&
    (el.getAttribute("role") === "dialog" || el.tagName === "DEBUG-OVERLAY" || el.tagName === "BUTTON"));

const onTap = (event: PointerEvent) => {
  if (!tapArmed || isUi(event)) return;
  event.preventDefault();
  event.stopPropagation();
  tapArmed = false;
  window.removeEventListener("pointerdown", onTap, true);
  const point = tapToFramePoint(event.clientX, event.clientY, window.innerWidth, window.innerHeight, info?.width ?? 4, info?.height ?? 3);
  void focusAt(point.x, point.y);
};

/** Test switch: the next tap on the camera picture focuses there (tap the switch again to cancel) */
export const armTapToFocus = (): void => {
  tapArmed = !tapArmed;
  if (tapArmed) window.addEventListener("pointerdown", onTap, true);
  else window.removeEventListener("pointerdown", onTap, true);
  lastAction = tapArmed ? "tap the picture to focus" : null;
  refreshCamera();
};

/** Ask for the camera's zoom when it starts (Chrome: the pan-tilt-zoom permission) – this device, next start */
export const getAskZoom = (): boolean => {
  try {
    return localStorage.getItem(ASK_ZOOM_KEY) === "true";
  } catch {
    return false;
  }
};

export const setAskZoom = (ask: boolean): void => {
  try {
    if (ask) localStorage.setItem(ASK_ZOOM_KEY, "true");
    else localStorage.removeItem(ASK_ZOOM_KEY);
  } catch {
    // storage blocked: stays off
  }
};

/** Video constraints with the zoom request added (an object; `true` becomes one) */
export const withZoomRequest = (constraints: MediaStreamConstraints): MediaStreamConstraints => {
  if (!constraints.video) return constraints;
  const video = constraints.video === true ? {} : constraints.video;
  return { ...constraints, video: { ...video, zoom: true } as MediaTrackConstraints };
};

let originalGetUserMedia: MediaDevices["getUserMedia"] | null = null;

/**
 * While "ask for zoom" is on, every camera request of the page asks for zoom too – the engine opens its camera
 * itself, so its request is changed on the way. Call before the engine starts; `releaseZoomRequest()` undoes it.
 */
export const requestZoomOnCameraStart = (): void => {
  const devices = navigator.mediaDevices;
  if (!getAskZoom() || !devices?.getUserMedia || originalGetUserMedia) return;
  const original = devices.getUserMedia.bind(devices);
  originalGetUserMedia = devices.getUserMedia;
  devices.getUserMedia = (constraints?: MediaStreamConstraints) =>
    original(constraints ? withZoomRequest(constraints) : constraints);
};

export const releaseZoomRequest = (): void => {
  if (!originalGetUserMedia) return;
  navigator.mediaDevices.getUserMedia = originalGetUserMedia;
  originalGetUserMedia = null;
};

/** One line for the collapsed overlay: lens number, resolution, focus mode and distance, zoom */
export const cameraSummary = (camera: CameraInfo | null = info): string => {
  if (!camera) return "";
  const lens = camera.label.match(/camera2 (\d+)/)?.[1] ?? (/back/i.test(camera.label) ? "back" : "?");
  const size = camera.width && camera.height ? `${camera.width}×${camera.height}` : "";
  const focus = camera.focusMode ? camera.focusMode.slice(0, 4) : "f?";
  const distance = camera.focusDistance !== null ? ` ${camera.focusDistance.toFixed(2)}m` : "";
  const zoom = camera.zoom !== null ? ` ${Number(camera.zoom.toFixed(2))}×` : "";
  return `C${lens} ${size} ${focus}${distance}${zoom}`.replace(/\s+/g, " ").trim();
};

/** The camera in one line: lens, resolution, focus mode and distance, zoom */
export const cameraLine = (camera: CameraInfo | null = info): string => {
  if (!camera) return "";
  const parts = [camera.label];
  if (camera.width && camera.height) parts.push(`${camera.width}×${camera.height}`);
  parts.push(`focus ${camera.focusMode ?? "?"}${camera.focusDistance !== null ? ` ${camera.focusDistance.toFixed(2)} m` : ""}`);
  if (camera.focusRange) parts.push(`range ${camera.focusRange.min}–${camera.focusRange.max} m`);
  parts.push(camera.zoomRange ? `zoom ${camera.zoom ?? 1}× (${camera.zoomRange.min}–${camera.zoomRange.max})` : "no zoom");
  return parts.join(" · ");
};
