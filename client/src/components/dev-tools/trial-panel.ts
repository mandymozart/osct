import { IGame } from "@/types";
import { GameStoreService } from "@/services";
import {
  cameraLine, getCameraInfo, setWindowOverride, subscribeCamera, type CameraInfo,
} from "@/components/ar-bridges";
import { getBook, getConfigVersion, getSpreads } from "@/utils/game-config";
import { countResults, trialReport, trialRows, TrialRow, TriggerInfos } from "./trial-report";
import { BottomSheet, SHEET_CSS } from "./debug-sheet";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Printed-image details per target, written by the content build's protocol command (optional) */
const TRIGGER_INFO_URL = "/trigger-protocol.json";
/** While the trial is open the tracker holds the current spread and its neighbours (±1): scanning the next image on
 * the sheet switches the spread by itself (Tilman, 2026-10-28 – was ±0 since 1.7.8) */
export const TRIAL_WINDOW = 1;

/** Book order of the printout (page, then the target's number on the page): `p038-2` → [38, 2] */
const bookOrder = (targetId: string): [number, number] => {
  const match = targetId.match(/^p(\d+)-(\d+)$/);
  return match ? [Number(match[1]), Number(match[2])] : [Number.MAX_SAFE_INTEGER, 0];
};

/** A target on the test printout: the printed-image details have its size (the others are noted as not printed) */
const isPrinted = (row: TrialRow): boolean => !!row.info?.width;

/**
 * The trial's rows in the printout's order, each printed one with its running number on the sheets (1, 2, 3 …, the
 * same numbers as the tester printouts of trial 2); targets not on the printout keep their place without a number.
 */
export const numberedRows = (rows: TrialRow[]): Array<TrialRow & { number: number | null }> => {
  // Without printed-image details (no protocol file) every target counts as printed
  const known = rows.some(row => row.info);
  let next = 1;
  return [...rows]
    .sort((a, b) => {
      const [pageA, nA] = bookOrder(a.targetId);
      const [pageB, nB] = bookOrder(b.targetId);
      return pageA - pageB || nA - nB;
    })
    .map(row => ({ ...row, number: !known || isPrinted(row) ? next++ : null }));
};

/**
 * Debug trial panel (a strip on the bottom edge, styled like the debug bar at the top turned upside down; opened
 * and closed with *trial* in the debug overlay): the trigger checklist of a test with the printed book. Shows every target in a fixed order – the order of
 * the printout, with its running number – so nothing moves: found ones get a green frame and a ✓, the one in view a
 * yellow frame, the current spread's a white frame, and the strip scrolls smoothly to the current spread when it
 * changes.
 * Tap a tile to go to its spread; ‹ › step through the spreads. Drag the top bar to make the strip taller or lower.
 * The bar shows how many targets are not found yet; **md** downloads the report for the designers (trial-report.ts).
 * While the panel is open the tracker holds the current spread and its neighbours (`TRIAL_WINDOW`, no grow);
 * closing restores the setting. A camera line under the bar shows the lens, resolution, focus and zoom the trial
 * runs with (camera-debug.ts) – feedback only, the trial uses the app's camera defaults; the md report records it.
 */
export class TrialPanel extends HTMLElement {
  private shadow: ShadowRoot;
  private game: Readonly<IGame>;
  private cleanups: Array<() => void> = [];
  private infos: TriggerInfos = {};
  private signature = "";
  private sheet: BottomSheet;
  /** The spread the strip last scrolled to – it scrolls again only when the current spread changes */
  private scrolledTo: string | null = null;
  /** Where the strip is scrolling to (smoothly) – kept across re-renders until reached or the reader scrolls */
  private scrollTarget: number | null = null;
  /** The camera last seen – the report records it even when the camera is off by the time md is tapped */
  private lastCamera: CameraInfo | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.shadow = this.attachShadow({ mode: "open" });
    // The height key predates the shared sheet – kept so testers keep their height
    this.sheet = new BottomSheet(this, this.shadow, { label: "Trigger trial", heightKey: "osct-trial-height", defaultHeight: () => 128 });
  }

  connectedCallback() {
    this.sheet.connect();
    setWindowOverride(TRIAL_WINDOW);
    this.cleanups.push(() => setWindowOverride(null));
    this.cleanups.push(
      this.game.subscribeToProperty("currentSpread", () => this.render()),
      this.game.subscribeToProperty("progress", () => this.render()),
      this.game.subscribeToProperty("trackedTargets", () => this.render()),
      subscribeCamera(camera => this.renderCamera(camera)),
    );
    this.shadow.addEventListener("click", this.onClick);
    this.render();
    void this.loadInfos();
  }

  disconnectedCallback() {
    this.sheet.disconnect();
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
  }

  private async loadInfos() {
    try {
      const response = await fetch(TRIGGER_INFO_URL);
      if (!response.ok) return;
      const infos = await response.json();
      if (infos && typeof infos === "object") {
        this.infos = infos;
        this.signature = ""; // the running numbers depend on which targets are printed
        this.render();
      }
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
      camera: cameraLine(getCameraInfo() ?? this.lastCamera),
      date: new Date(),
    });
  }

  /** Re-rendering replaces the bar that holds a drag's pointer capture: the sheet waits until the drag ends */
  private render() {
    this.sheet.render(() => this.draw());
  }

  private draw() {
    const rows = this.rows();
    const current = this.game.state.currentSpread;
    const tracked = this.game.state.trackedTargets;
    const shown = numberedRows(rows);
    const signature = [current, tracked.join(","), shown.map(row => `${row.targetId}${row.result[0]}`).join(",")].join("|");
    if (signature === this.signature) return;
    this.signature = signature;

    const grid = this.shadow.querySelector(".grid");
    const scrollTop = grid?.scrollTop ?? 0;
    const left = countResults(rows).untested;
    const spread = getSpreads().find(s => s.id === current);
    const tile = (row: TrialRow & { number: number | null }) => {
      const own = row.spreadId === current;
      const found = row.result === "found";
      const page = `p.${row.page}·${row.targetId.split("-").pop()}`;
      const classes = ["tile", own ? "own" : "", found ? "found" : "", tracked.includes(row.targetId) ? "seen" : "", row.number === null ? "absent" : ""];
      return `<button class="${classes.join(" ").trim()}" data-spread="${escapeHtml(row.spreadId)}"
        title="${escapeHtml(`${row.number ?? "not printed"} · ${row.targetId} · ${row.title}`)}">
        <img src="${escapeHtml(row.imageSrc)}" alt="" loading="lazy" decoding="async">${row.number !== null ? `<b class="num">${row.number}</b>` : ""}${found ? `<b class="check" aria-label="found">✓</b>` : ""}<span>${escapeHtml(row.number === null ? `${page} not printed` : page)}</span>
      </button>`;
    };

    this.shadow.innerHTML = `
      <style>
        ${SHEET_CSS}
        .left { margin-right: auto; color: #fff; white-space: nowrap; }
        .left b { color: #ff0; }
        .grid { display: flex; flex-wrap: wrap; gap: .25rem; padding: 0 .25rem .25rem; align-content: flex-start; }
        .tile { position: relative; flex: none; width: 3.5rem; height: 3.5rem; padding: 0; border: .1875rem solid transparent;
          border-radius: 0; background: #111; overflow: hidden; }
        .tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
        .tile span { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, .6); color: #fff;
          font-size: .625rem; line-height: .875rem; text-align: center; }
        .tile.own { border-color: #fff; }
        .tile.found { border-color: #0f0; }
        .tile.found span { background: #0f0; color: #000; }
        .tile .num { position: absolute; top: 0; left: 0; min-width: 1rem; height: 1rem; padding: 0 .125rem; background: #000;
          color: #fff; font: 700 .6875rem/1rem monospace; text-align: center; }
        .tile.absent { opacity: .35; }
        .tile .check { position: absolute; top: 0; right: 0; width: 1rem; height: 1rem; background: #0f0; color: #000;
          font: 700 .75rem/1rem monospace; text-align: center; }
        .tile.seen { border-color: #ff0; }
        .cam { flex: none; display: flex; align-items: center; gap: .25rem; padding: 0 .25rem .25rem; color: #ccc; }
        .cam .info { margin-right: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      </style>
      <div class="bar">
        <button data-action="previous" aria-label="Previous spread">‹</button>
        <button data-action="next" aria-label="Next spread">›</button>
        <span class="left">${escapeHtml(spread ? `p. ${spread.title}` : "–")} · <b>${left}</b> not found</span>
        <button data-action="download">md</button>
        <button class="close" data-action="close" aria-label="Close">×</button>
      </div>
      <div class="cam"></div>
      <div class="body grid">${shown.map(tile).join("")}</div>
    `;
    const newGrid = this.shadow.querySelector<HTMLElement>(".grid");
    if (newGrid) newGrid.scrollTop = scrollTop;
    // A new current spread: bring its row into view (the tiles never move, the view follows the reader)
    const ownTile = this.shadow.querySelector<HTMLElement>(".tile.own");
    if (newGrid && ownTile && current !== this.scrolledTo) {
      this.scrolledTo = current;
      this.scrollTarget = Math.max(0, ownTile.offsetTop - newGrid.offsetTop - 4);
    }
    if (newGrid) this.scrollToTarget(newGrid);
    this.renderCamera(getCameraInfo());
  }

  /**
   * Scrolls smoothly to the current spread's row, so the reader sees the strip move. A re-render replaces the grid
   * mid-scroll (a find changes the spread and the tracked targets at once): the new grid continues from where the old
   * one was. Touching or wheeling the strip hands the scrolling back to the reader.
   */
  private scrollToTarget(grid: HTMLElement) {
    const target = this.scrollTarget;
    if (target === null) return;
    const stop = () => { this.scrollTarget = null; };
    grid.addEventListener("touchstart", stop, { passive: true, once: true });
    grid.addEventListener("wheel", stop, { passive: true, once: true });
    grid.addEventListener("scroll", () => {
      const end = Math.min(target, grid.scrollHeight - grid.clientHeight);
      if (Math.abs(grid.scrollTop - end) < 2) stop();
    }, { passive: true });
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    grid.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
    if (Math.abs(grid.scrollTop - Math.min(target, grid.scrollHeight - grid.clientHeight)) < 2) stop();
  }

  /**
   * The camera row only – feedback, no switches: the trial runs with the app's camera defaults (#37: main lens,
   * continuous focus). It changes every second while the camera focuses, the tiles stay; the md report records it.
   */
  private renderCamera(camera: CameraInfo | null) {
    const row = this.shadow.querySelector(".cam");
    if (!row) return;
    if (!camera) {
      row.innerHTML = `<span class="info">camera: –</span>`;
      return;
    }
    this.lastCamera = camera;
    row.innerHTML = `<span class="info">camera: ${escapeHtml(cameraLine(camera))}</span>`;
  }

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
