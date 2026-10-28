import { IGame } from "@/types";
import { GameStoreService } from "@/services";
import {
  applyContinuousFocus, armTapToFocus, cameraLine, cycleZoom, getCameraInfo, setWindowOverride, subscribeCamera, type CameraInfo,
} from "@/components/ar-bridges";
import { getBook, getConfigVersion, getSpreads } from "@/utils/game-config";
import { countResults, trialReport, trialRows, TrialRow, TriggerInfos } from "./trial-report";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Printed-image details per target, written by the content build's protocol command (optional) */
const TRIGGER_INFO_URL = "/trigger-protocol.json";
/** The panel's height, set by dragging its top bar (this device only) */
const HEIGHT_KEY = "osct-trial-height";
const DEFAULT_HEIGHT = 128;
const MIN_HEIGHT = 30;

const storedHeight = (): number => {
  try {
    const value = Number(localStorage.getItem(HEIGHT_KEY));
    return value >= MIN_HEIGHT ? value : DEFAULT_HEIGHT;
  } catch {
    return DEFAULT_HEIGHT;
  }
};

/**
 * Debug trial panel (a strip at the bottom, opened and closed with *trial* in the debug overlay): the trigger
 * checklist of a test with the printed book. Shows the current spread's targets (found ones framed green with a ✓
 * in the corner, the one in view framed yellow), then every target not found yet, from the next pages on – tap one to go to its spread;
 * ‹ › step through the spreads. Drag the top bar to make the strip taller or lower. The bar shows how many targets
 * are not found yet; **md** downloads the report of those for the designers (trial-report.ts).
 * While the panel is open the tracker holds the current spread only (window ±0, no grow, no preloading of other
 * spreads) – the trial tests the engine with the printout, not the background work; closing restores the setting.
 * A camera row under the bar shows the lens, resolution, focus and zoom (camera-debug.ts) with three test switches:
 * **AF** continuous focus, **◎** tap the picture to focus there, **1×** the next zoom step.
 */
export class TrialPanel extends HTMLElement {
  private shadow: ShadowRoot;
  private game: Readonly<IGame>;
  private cleanups: Array<() => void> = [];
  private infos: TriggerInfos = {};
  private signature = "";
  private drag: { pointerId: number; startY: number; startHeight: number } | null = null;
  private renderAfterDrag = false;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    // Taps on the panel are UI, not taps on the AR scene (ArScene ignores dialogs)
    this.setAttribute("role", "dialog");
    this.setAttribute("aria-label", "Trigger trial");
    this.setHeight(storedHeight());
    setWindowOverride(0);
    this.cleanups.push(() => setWindowOverride(null));
    this.cleanups.push(
      this.game.subscribeToProperty("currentSpread", () => this.render()),
      this.game.subscribeToProperty("progress", () => this.render()),
      this.game.subscribeToProperty("trackedTargets", () => this.render()),
      subscribeCamera(camera => this.renderCamera(camera)),
    );
    this.shadow.addEventListener("click", this.onClick);
    this.shadow.addEventListener("pointerdown", this.onPointerDown);
    this.shadow.addEventListener("pointermove", this.onPointerMove);
    this.shadow.addEventListener("pointerup", this.onPointerUp);
    this.shadow.addEventListener("pointercancel", this.onPointerUp);
    this.render();
    void this.loadInfos();
  }

  disconnectedCallback() {
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
  }

  private async loadInfos() {
    try {
      const response = await fetch(TRIGGER_INFO_URL);
      if (!response.ok) return;
      const infos = await response.json();
      if (infos && typeof infos === "object") this.infos = infos;
    } catch {
      // No protocol file (not generated): the report goes without printed-image details
    }
  }

  rows(): TrialRow[] {
    return trialRows(getSpreads(), this.game.state.progress.unlocked, this.infos);
  }

  report(): string {
    return trialReport(this.rows(), {
      bookTitle: getBook().title,
      appVersion: __VITE_APP_VERSION__,
      contentHash: getConfigVersion().hash ?? "",
      device: navigator.userAgent,
      camera: cameraLine(getCameraInfo()),
      date: new Date(),
    });
  }

  /** The current spread's targets, then the targets not found yet of the following spreads (wrapping round) */
  private shown(rows: TrialRow[], current: string | null): TrialRow[] {
    const order = getSpreads().map(spread => spread.id);
    const start = Math.max(0, order.indexOf(current ?? ""));
    const rank = (spreadId: string) => (order.indexOf(spreadId) - start + order.length) % order.length;
    const own = rows.filter(row => row.spreadId === current);
    const missing = rows.filter(row => row.spreadId !== current && row.result === "untested")
      .sort((a, b) => rank(a.spreadId) - rank(b.spreadId));
    return [...own, ...missing];
  }

  private render() {
    // Re-rendering replaces the bar that holds the drag's pointer capture: wait until the drag ends
    if (this.drag) {
      this.renderAfterDrag = true;
      return;
    }
    const rows = this.rows();
    const current = this.game.state.currentSpread;
    const tracked = this.game.state.trackedTargets;
    const shown = this.shown(rows, current);
    const signature = [current, tracked.join(","), shown.map(row => `${row.targetId}${row.result[0]}`).join(",")].join("|");
    if (signature === this.signature) return;
    this.signature = signature;

    const grid = this.shadow.querySelector(".grid");
    const scrollTop = grid?.scrollTop ?? 0;
    const left = countResults(rows).untested;
    const spread = getSpreads().find(s => s.id === current);
    const tile = (row: TrialRow) => {
      const own = row.spreadId === current;
      const found = row.result === "found";
      const label = `${row.page}·${row.targetId.split("-").pop()}`;
      return `<button class="tile ${own ? "own" : ""} ${found ? "found" : ""} ${tracked.includes(row.targetId) ? "seen" : ""}"
        data-spread="${escapeHtml(row.spreadId)}" title="${escapeHtml(`${row.targetId} · ${row.title}`)}">
        <img src="${escapeHtml(row.imageSrc)}" alt="" loading="lazy" decoding="async">${found ? `<b class="check" aria-label="found">✓</b>` : ""}<span>${escapeHtml(label)}</span>
      </button>`;
    };

    this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed; left: .25rem; right: .25rem; bottom: calc(env(safe-area-inset-bottom) + .25rem);
          z-index: 10000; box-sizing: border-box; display: flex; flex-direction: column;
          border-radius: .5rem; background: rgba(0, 0, 0, .8); color: #0f0; font: .6875rem/1rem monospace;
          cursor: default; user-select: none; overflow: hidden;
        }
        .bar { flex: none; display: flex; align-items: center; gap: .25rem; height: 1.875rem; padding: 0 .25rem;
          touch-action: none; cursor: ns-resize; position: relative; }
        .bar::before { content: ""; position: absolute; left: 50%; top: .1875rem; width: 2rem; height: .1875rem;
          margin-left: -1rem; border-radius: .125rem; background: #0a0; }
        .left { margin-right: auto; color: #fff; white-space: nowrap; }
        .left b { color: #ff0; }
        button { font: inherit; color: inherit; background: none; border: .0625rem solid #0f0; border-radius: .25rem;
          min-width: 1.75rem; height: 1.5rem; padding: 0 .375rem; cursor: pointer; touch-action: manipulation; }
        .close { font-size: 1rem; }
        .grid { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-wrap: wrap; gap: .25rem;
          padding: 0 .25rem .25rem; align-content: flex-start; }
        .tile { position: relative; flex: none; width: 3.5rem; height: 3.5rem; padding: 0; border: .1875rem solid transparent;
          border-radius: 0; background: #111; overflow: hidden; }
        .tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
        .tile span { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, .6); color: #fff;
          font-size: .625rem; line-height: .875rem; text-align: center; }
        .tile.own { border-color: #fff; }
        .tile.found { border-color: #0f0; }
        .tile.found span { background: #0f0; color: #000; }
        .tile .check { position: absolute; top: 0; right: 0; width: 1rem; height: 1rem; background: #0f0; color: #000;
          font: 700 .75rem/1rem monospace; text-align: center; }
        .tile.seen { border-color: #ff0; }
        .cam { flex: none; display: flex; align-items: center; gap: .25rem; padding: 0 .25rem .25rem; color: #ccc; }
        .cam .info { margin-right: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cam .action { color: #ff0; }
        .cam button.on { background: #0f0; color: #000; }
      </style>
      <div class="bar">
        <button data-action="previous" aria-label="Previous spread">‹</button>
        <button data-action="next" aria-label="Next spread">›</button>
        <span class="left">${escapeHtml(spread ? `p. ${spread.title}` : "–")} · <b>${left}</b> not found</span>
        <button data-action="download">md</button>
        <button class="close" data-action="close" aria-label="Close">×</button>
      </div>
      <div class="cam"></div>
      <div class="grid">${shown.map(tile).join("")}</div>
    `;
    const newGrid = this.shadow.querySelector(".grid");
    if (newGrid) newGrid.scrollTop = scrollTop;
    this.renderCamera(getCameraInfo());
  }

  /** The camera row only – it changes every second while the camera focuses, the tiles stay */
  private renderCamera(camera: CameraInfo | null) {
    const row = this.shadow.querySelector(".cam");
    if (!row) return;
    if (!camera) {
      row.innerHTML = `<span class="info">camera: –</span>`;
      return;
    }
    const zoom = camera.zoom !== null ? `${Number(camera.zoom.toFixed(2))}×` : "zoom";
    row.innerHTML = `
      <span class="info">${escapeHtml(cameraLine(camera))}${camera.lastAction ? ` · <span class="action">${escapeHtml(camera.lastAction)}</span>` : ""}</span>
      <button data-action="focus-continuous" aria-label="Continuous focus">AF</button>
      <button data-action="focus-tap" class="${camera.tapArmed ? "on" : ""}" aria-label="Tap to focus">◎</button>
      <button data-action="zoom" aria-label="Next zoom step">${zoom}</button>`;
  }

  private setHeight(height: number) {
    const max = Math.round(window.innerHeight * 0.85);
    this.style.height = `${Math.max(MIN_HEIGHT, Math.min(max, Math.round(height)))}px`;
  }

  /** Dragging the top bar (not its buttons) sets the height: up = taller */
  private onPointerDown = (event: Event) => {
    const pointer = event as PointerEvent;
    const target = pointer.target as HTMLElement;
    if (!target.closest(".bar") || target.closest("button")) return;
    this.drag = { pointerId: pointer.pointerId, startY: pointer.clientY, startHeight: this.getBoundingClientRect().height };
    try {
      (target.closest(".bar") as HTMLElement).setPointerCapture(pointer.pointerId);
    } catch {
      // No capture (pointer already gone): the drag still follows moves over the panel
    }
    pointer.preventDefault();
  };

  private onPointerMove = (event: Event) => {
    const pointer = event as PointerEvent;
    if (!this.drag || pointer.pointerId !== this.drag.pointerId) return;
    this.setHeight(this.drag.startHeight + this.drag.startY - pointer.clientY);
  };

  private onPointerUp = (event: Event) => {
    const pointer = event as PointerEvent;
    if (!this.drag || pointer.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    if (this.renderAfterDrag) {
      this.renderAfterDrag = false;
      this.render();
    }
    try {
      localStorage.setItem(HEIGHT_KEY, String(Math.round(this.getBoundingClientRect().height)));
    } catch {
      // Storage blocked: the height stays for this session
    }
  };

  private step(direction: 1 | -1) {
    const spreads = getSpreads();
    const index = spreads.findIndex(spread => spread.id === this.game.state.currentSpread);
    const next = spreads[(index + direction + spreads.length) % spreads.length];
    if (next) this.game.spreads.switchSpread(next.id);
  }

  private onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!button) return;
    if (button.dataset.spread) {
      if (button.dataset.spread !== this.game.state.currentSpread) this.game.spreads.switchSpread(button.dataset.spread);
      return;
    }
    switch (button.dataset.action) {
      case "close":
        return this.remove();
      case "previous":
        return this.step(-1);
      case "next":
        return this.step(1);
      case "download":
        return this.download();
      case "focus-continuous":
        return void applyContinuousFocus();
      case "focus-tap":
        return armTapToFocus();
      case "zoom":
        return void cycleZoom();
    }
  };

  private download() {
    const blob = new Blob([this.report()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `osct-trigger-test-${new Date().toISOString().slice(0, 10)}.md`;
    this.shadow.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true") {
  customElements.define("trial-panel", TrialPanel);
}
