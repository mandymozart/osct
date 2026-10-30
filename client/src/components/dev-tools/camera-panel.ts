import type { IGame } from "@/types";
import { BottomSheet, SHEET_CSS } from "./debug-sheet";
import { GameStoreService } from "@/services";
import {
  applyContinuousFocus, armTapToFocus, CAMERA_RESOLUTIONS, getArError, getAskZoom, getCameraResolution, setCameraResolution, getCameraInfo, getLensChoice, setAskZoom, setLensChoice, setWindowOverride,
  setZoom, subscribeCamera, zoomSteps, type CameraInfo,
} from "@/components/ar-bridges";
import { getSpreads, getTarget, getTargets } from "@/utils/game-config";

/** Target ids to retest, comma-separated (set by hand, e.g. the misses of an earlier trial) – this device */
const RETEST_KEY = "osct-camera-retest";

// A link with `?retest=<ids>` sets the list on this device (read at start, before the router rewrites the address)
const linkedRetest = new URLSearchParams(location.search).get("retest");
if (linkedRetest !== null) {
  try {
    localStorage.setItem(RETEST_KEY, linkedRetest);
  } catch {
    // storage blocked: no retest list
  }
}

const retestIds = (): string[] => {
  try {
    return (localStorage.getItem(RETEST_KEY) ?? "").split(",").map(id => id.trim()).filter(id => getTarget(id));
  } catch {
    return [];
  }
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Debug camera panel (a bottom sheet, debug-sheet.ts, opened and closed with *camera* in the debug overlay): the camera test
 * with the printed book. Shows what the browser reports for the engine's camera (lens, resolution, focus mode /
 * distance / range, zoom – camera-debug.ts) and the current spread's targets: yellow while in view, ✓ once found
 * since the panel opened. ‹ › step through the spreads. A retest list (`osct-camera-retest` in local storage, or a link with `?retest=`: target
 * ids, e.g. the misses of an earlier trial) shows one chip per target – tap to go to its spread, ✓ once found. Test switches: **AF** continuous focus, **◎** tap the
 * picture to focus there, the zoom steps; **lens** (main back lens or the browser's choice), **res** (the camera size)
 * and **ask zoom** apply
 * on the next camera start (reload). While the panel is open the tracker holds the current spread only, as in the
 * trial.
 */
export class CameraPanel extends HTMLElement {
  private shadow: ShadowRoot;
  private game: Readonly<IGame>;
  private cleanups: Array<() => void> = [];
  private found = new Set<string>();
  private sheet: BottomSheet;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.shadow = this.attachShadow({ mode: "open" });
    this.sheet = new BottomSheet(this, this.shadow, { label: "Camera test", heightKey: "osct-sheet-camera-height", defaultHeight: () => 200 });
  }

  connectedCallback() {
    this.sheet.connect();
    setWindowOverride(0);
    this.cleanups.push(() => setWindowOverride(null));
    this.cleanups.push(
      this.game.subscribeToProperty("currentSpread", () => this.renderTargets()),
      this.game.subscribeToProperty("trackedTargets", tracked => {
        tracked.forEach(target => this.found.add(target));
        this.renderTargets();
      }),
      subscribeCamera(camera => this.renderCamera(camera)),
    );
    this.shadow.addEventListener("click", this.onClick);
    this.render();
  }

  disconnectedCallback() {
    this.sheet.disconnect();
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
  }

  private render() {
    this.shadow.innerHTML = `
      <style>
        ${SHEET_CSS}
        .body { display: flex; flex-direction: column; gap: .25rem; padding: .25rem; }
        .row { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; }
        .spread { margin-right: auto; color: #fff; white-space: nowrap; }
        .target { border: .0625rem solid #555; border-radius: .25rem; padding: 0 .25rem; color: #ccc; }
        .target.found { border-color: #0f0; color: #0f0; }
        .target.seen { border-color: #ff0; background: #ff0; color: #000; }
        button.target { height: auto; min-width: 0; }
        .label { color: #fff; overflow-wrap: anywhere; }
        .small { color: #9c9; overflow-wrap: anywhere; }
        .action { color: #ff0; overflow-wrap: anywhere; }
      </style>
      <div class="bar">
        <button data-action="previous" aria-label="Previous spread">‹</button>
        <button data-action="next" aria-label="Next spread">›</button>
        <span class="spread"></span>
        <button class="close" data-action="close" aria-label="Close">×</button>
      </div>
      <div class="body">
        <div class="row targets"></div>
        <div class="row retest"></div>
        <div class="camera"></div>
      </div>
    `;
    this.renderTargets();
    this.renderCamera(getCameraInfo());
  }

  private renderTargets() {
    const current = this.game.state.currentSpread;
    const spread = getSpreads().find(s => s.id === current);
    const label = this.shadow.querySelector(".spread");
    if (label) label.textContent = spread ? `p. ${spread.title}` : "–";
    const row = this.shadow.querySelector(".targets");
    if (!row) return;
    const tracked = this.game.state.trackedTargets;
    row.innerHTML = getTargets(current ?? "").map(target => {
      const state = tracked.includes(target.id) ? "seen" : this.found.has(target.id) ? "found" : "";
      return `<span class="target ${state}">${state === "found" ? "✓ " : ""}${escapeHtml(target.id)}</span>`;
    }).join("") || `<span class="small">no targets</span>`;
    const retest = this.shadow.querySelector(".retest");
    if (!retest) return;
    const ids = retestIds();
    const left = ids.filter(id => !this.found.has(id)).length;
    retest.innerHTML = ids.length ? `<span class="small">retest ${ids.length - left}/${ids.length}</span>` + ids.map(id => {
      const state = tracked.includes(id) ? "seen" : this.found.has(id) ? "found" : "";
      return `<button class="target ${state}" data-target="${escapeHtml(id)}">${state === "found" ? "✓ " : ""}${escapeHtml(id)}</button>`;
    }).join("") : "";
  }

  /** The readout and the switches – it changes every second while the camera focuses */
  private renderCamera(camera: CameraInfo | null) {
    const box = this.shadow.querySelector(".camera");
    if (!box) return;
    const lens = getLensChoice();
    const resolution = getCameraResolution();
    const restartSwitches = `
      <button data-action="lens" aria-label="Lens on the next start">lens: ${lens}</button>
      <button data-action="resolution" aria-label="Camera size on the next start">res: ${resolution ? `${resolution.width}×${resolution.height}` : "engine"}</button>
      <button data-action="ask-zoom" class="${getAskZoom() ? "on" : ""}" aria-label="Ask for zoom on the next start">ask zoom</button>`;
    if (!camera) {
      const error = getArError();
      box.innerHTML = `<div class="row"><span class="small">camera: – (not running)</span>${restartSwitches}</div>${error ? `<div class="action">AR error: ${escapeHtml(error)}</div>` : ""}`;
      return;
    }
    const value = (text: string | number | null) => (text === null || text === "" ? "–" : escapeHtml(String(text)));
    const round = (n: number) => Number(n.toFixed(2));
    const range = (r: { min: number; max: number } | null, unit = "") => (r ? `${round(r.min)}–${r.max > 1000 ? "∞" : round(r.max)}${unit}` : null);
    const continuous = camera.focusMode === "continuous";
    // Chrome reports 0 while focusing continuously – the distance the autofocus settles on is not reported
    const distance = camera.focusDistance !== null && !(continuous && camera.focusDistance === 0) ? ` ${camera.focusDistance.toFixed(2)} m` : "";
    const zoomButtons = zoomSteps(camera.zoomRange)
      .map(step => `<button data-action="zoom" data-zoom="${step}" class="${camera.zoom !== null && Math.abs(camera.zoom - step) < 0.01 ? "on" : ""}">${step}×</button>`)
      .join("");
    box.innerHTML = `
      <div class="label">${value(camera.label)} · ${value(camera.width && camera.height ? `${camera.width}×${camera.height}` : null)}${camera.frameRate ? ` @ ${Math.round(camera.frameRate)} fps` : ""}</div>
      <div>focus <b>${value(camera.focusMode)}</b>${distance}
        <span class="small">· modes ${value(camera.focusModes.join(", ") || null)} · range ${value(range(camera.focusRange, " m"))} · tap ${camera.pointsOfInterest ? "yes" : "no"}</span></div>
      <div>zoom ${value(camera.zoom)} <span class="small">· range ${value(range(camera.zoomRange))}</span></div>
      <div class="row">
        <button data-action="focus-continuous" class="${continuous ? "on" : ""}" aria-label="Continuous focus">AF</button>
        <button data-action="focus-tap" class="${camera.tapArmed ? "on" : ""}" aria-label="Tap to focus">◎</button>
        ${zoomButtons || '<span class="small">no zoom</span>'}
        ${restartSwitches}
      </div>
      ${camera.lastAction ? `<div class="action">${escapeHtml(camera.lastAction)}</div>` : ""}`;
  }

  private step(direction: 1 | -1) {
    const spreads = getSpreads();
    const index = spreads.findIndex(spread => spread.id === this.game.state.currentSpread);
    const next = spreads[(index + direction + spreads.length) % spreads.length];
    if (next) this.game.spreads.switchSpread(next.id);
  }

  private restart(question: string) {
    this.renderCamera(getCameraInfo());
    if (confirm(question)) location.reload();
  }

  private onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (button?.dataset.target) {
      const spreadId = getTarget(button.dataset.target)?.spreadId;
      if (spreadId && spreadId !== this.game.state.currentSpread) this.game.spreads.switchSpread(spreadId);
      return;
    }
    switch (button?.dataset.action) {
      case "close":
        return this.remove();
      case "previous":
        return this.step(-1);
      case "next":
        return this.step(1);
      case "focus-continuous":
        return void applyContinuousFocus();
      case "focus-tap":
        return armTapToFocus();
      case "zoom":
        return void setZoom(Number(button.dataset.zoom));
      case "lens":
        setLensChoice(getLensChoice() === "main" ? "browser" : "main");
        return this.restart("Reload now to restart the camera with the other lens?");
      case "resolution": {
        const index = CAMERA_RESOLUTIONS.indexOf(getCameraResolution());
        setCameraResolution(CAMERA_RESOLUTIONS[(index + 1) % CAMERA_RESOLUTIONS.length]);
        return this.restart("Reload now to restart the camera at the new size?");
      }
      case "ask-zoom":
        setAskZoom(!getAskZoom());
        return this.restart("Reload now to restart the camera with the new zoom request?");
    }
  };
}

if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true") {
  customElements.define("camera-panel", CameraPanel);
}
