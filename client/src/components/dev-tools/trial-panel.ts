import type { IGame } from "@/types";
import { GameStoreService } from "@/services";
import {
  cameraLine, fetchTriggerInfos, getCameraInfo, setWindowOverride, subscribeCamera, type CameraInfo,
} from "@/components/ar-bridges";
import { getBook, getConfigVersion, getSpreads } from "@/utils/game-config";
import { countResults, trialReport, trialRows, type TrialRow, type TriggerInfos } from "./trial-report";
import {
  devicePrefill, osLine, pickList, readScreen, readUaHints, screenLine, type DevicePrefill, type ScreenSize, type UaHints,
} from "./trial-device";
import { BottomSheet, SHEET_CSS } from "./debug-sheet";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** While the trial is open the tracker holds the current spread and its neighbours (±1): scanning the next image on
 * the sheet switches the spread by itself */
export const TRIAL_WINDOW = 1;

/** Where the strip remembers the tester's phone model and initials on this device */
export const TRIAL_MODEL_KEY = "osct-trial-model";
export const TRIAL_TESTER_KEY = "osct-trial-tester";

const readStored = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

const writeStored = (key: string, value: string) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // storage blocked: the value holds while the strip is open
  }
};

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
 * A device row asks for the phone model (required for **md**, prefilled from the browser's model code or narrowed by
 * an iPhone's screen size – trial-device.ts) and, optionally, the tester's initials; both are remembered on the device
 * (`TRIAL_MODEL_KEY`, `TRIAL_TESTER_KEY`) and go into the report's header (#235).
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
  /** The phone model as the tester entered or confirmed it – md waits until it is filled in */
  private model = readStored(TRIAL_MODEL_KEY);
  private tester = readStored(TRIAL_TESTER_KEY);
  private size: ScreenSize = readScreen();
  private hints: UaHints = {};
  private prefill: DevicePrefill;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.shadow = this.attachShadow({ mode: "open" });
    // The height key predates the shared sheet – kept so testers keep their height
    this.sheet = new BottomSheet(this, this.shadow, { label: "Trigger trial", heightKey: "osct-trial-height", defaultHeight: () => 168 });
    this.prefill = devicePrefill(navigator.userAgent, this.size, this.hints);
    if (!this.model) this.model = this.prefill.model;
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
    this.shadow.addEventListener("input", this.onInput);
    this.shadow.addEventListener("change", this.onPick);
    this.render();
    void this.loadInfos();
    void this.loadHints();
  }

  disconnectedCallback() {
    this.sheet.disconnect();
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
  }

  /** Printed-image details (optional – without the protocol file the report goes without them) */
  private async loadInfos() {
    const infos = await fetchTriggerInfos();
    if (!Object.keys(infos).length) return;
    this.infos = infos;
    this.signature = ""; // the running numbers depend on which targets are printed
    this.render();
  }

  /** The browser's model code and OS version (Chromium): the prefill of an empty model field, the real OS version */
  private async loadHints() {
    const hints = await readUaHints();
    if (!Object.keys(hints).length) return;
    this.hints = hints;
    this.prefill = devicePrefill(navigator.userAgent, this.size, hints);
    if (!this.model && this.prefill.model) {
      this.model = this.prefill.model;
      const field = this.shadow.querySelector<HTMLInputElement>('input[name="model"]');
      if (field) field.value = this.model;
    }
    this.renderDevice();
  }

  /** The report can be exported once the phone model is filled in */
  canExport(): boolean {
    return this.model.trim().length > 0;
  }

  rows(): TrialRow[] {
    return trialRows(getSpreads(), this.game.state.progress.unlocked, this.infos);
  }

  report(): string {
    return trialReport(this.rows(), {
      bookTitle: getBook().title,
      appVersion: __VITE_APP_VERSION__,
      contentHash: getConfigVersion().hash ?? "",
      device: {
        model: this.model,
        tester: this.tester,
        source: this.prefill.source,
        screen: screenLine(this.size),
        os: osLine(navigator.userAgent, this.hints),
        language: navigator.language,
        userAgent: navigator.userAgent,
      },
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

    this.drawShell();
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

    const bar = this.shadow.querySelector(".bar");
    if (bar) {
      bar.innerHTML = `
        <button data-action="previous" aria-label="Previous spread">‹</button>
        <button data-action="next" aria-label="Next spread">›</button>
        <span class="left">${escapeHtml(spread ? `p. ${spread.title}` : "–")} · <b>${left}</b> not found</span>
        <button data-action="download">md</button>
        <button class="close" data-action="close" aria-label="Close">×</button>`;
    }
    this.renderExport();
    // A fresh grid each time: a running smooth scroll and its listeners go with the old one
    const fresh = document.createElement("div");
    fresh.className = "body grid";
    fresh.innerHTML = shown.map(tile).join("");
    grid?.replaceWith(fresh);
    fresh.scrollTop = scrollTop;
    // A new current spread: bring its row into view (the tiles never move, the view follows the reader)
    const ownTile = fresh.querySelector<HTMLElement>(".tile.own");
    if (ownTile && current !== this.scrolledTo) {
      this.scrolledTo = current;
      this.scrollTarget = Math.max(0, ownTile.offsetTop - fresh.offsetTop - 4);
    }
    this.scrollToTarget(fresh);
    this.renderCamera(getCameraInfo());
  }

  /**
   * The strip's frame, drawn once: the bar and the grid are redrawn as the trial goes on, the device row keeps its
   * fields (and what the tester is typing), the camera row is updated on its own.
   */
  private drawShell() {
    if (this.shadow.querySelector(".bar")) return;
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
        .device { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; padding: .25rem; }
        /* 16px: iOS zooms the page into smaller fields */
        .device input, .device select { min-width: 0; height: 1.75rem; box-sizing: border-box; padding: 0 .25rem;
          border: .0625rem solid #0f0; border-radius: .25rem; background: #000; color: #fff; font: 1rem/1 monospace; }
        .device input[name="model"] { flex: 1 1 8rem; }
        .device select { flex: none; width: 4.75rem; color: #0f0; }
        .device input[name="tester"] { flex: none; width: 5.5rem; }
        .device input::placeholder { color: #888; }
        .device .hint { flex-basis: 100%; color: #ccc; }
        .device .hint.need { color: #ff0; }
        button.off { opacity: .4; }
      </style>
      <div class="bar"></div>
      <div class="device">
        <input name="model" aria-label="Phone model" placeholder="phone model" autocomplete="off" autocapitalize="off" spellcheck="false">
        <select name="pick" aria-label="Pick the phone model"></select>
        <input name="tester" aria-label="Tester's initials (optional)" placeholder="initials" maxlength="16" autocomplete="off" spellcheck="false">
        <span class="hint"></span>
      </div>
      <div class="cam"></div>
      <div class="body grid"></div>
    `;
    const model = this.shadow.querySelector<HTMLInputElement>('input[name="model"]');
    const tester = this.shadow.querySelector<HTMLInputElement>('input[name="tester"]');
    if (model) model.value = this.model;
    if (tester) tester.value = this.tester;
    this.renderDevice();
  }

  /** The pick list (an iPhone's screen-size guess first), then the md state and the hint */
  private renderDevice() {
    const pick = this.shadow.querySelector<HTMLSelectElement>('select[name="pick"]');
    if (pick) {
      const groups = pickList(this.prefill.candidates).map(({ group, models }) =>
        `<optgroup label="${escapeHtml(group)}">${models.map(model => `<option>${escapeHtml(model)}</option>`).join("")}</optgroup>`);
      pick.innerHTML = `<option value="">list</option>${groups.join("")}`;
      pick.value = "";
    }
    this.renderExport();
  }

  /** md waits for the phone model: dimmed until it is filled in, the hint says why */
  private renderExport() {
    const ready = this.canExport();
    const download = this.shadow.querySelector<HTMLElement>('[data-action="download"]');
    if (download) {
      download.classList.toggle("off", !ready);
      download.setAttribute("aria-disabled", String(!ready));
      download.title = ready ? "Download the report" : "Enter the phone model first";
    }
    const hint = this.shadow.querySelector<HTMLElement>(".device .hint");
    if (hint) {
      hint.classList.toggle("need", !ready);
      hint.textContent = [ready ? "" : "the phone model is needed for md", this.prefill.hint].filter(Boolean).join(" · ");
      hint.hidden = !hint.textContent;
    }
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
        if (!this.canExport()) return this.shadow.querySelector<HTMLInputElement>('input[name="model"]')?.focus();
        return this.download();
    }
  };

  /** Typing into the model or initials field: remembered on the device at once */
  private onInput = (event: Event) => {
    const field = event.target as HTMLInputElement;
    if (field.name === "model") {
      this.model = field.value;
      writeStored(TRIAL_MODEL_KEY, field.value.trim());
      this.renderExport();
    } else if (field.name === "tester") {
      this.tester = field.value;
      writeStored(TRIAL_TESTER_KEY, field.value.trim());
    }
  };

  /** A model from the pick list goes into the model field (still editable), the list returns to its label */
  private onPick = (event: Event) => {
    const pick = event.target as HTMLSelectElement;
    if (pick.name !== "pick" || !pick.value) return;
    const field = this.shadow.querySelector<HTMLInputElement>('input[name="model"]');
    if (field) field.value = pick.value;
    this.model = pick.value;
    writeStored(TRIAL_MODEL_KEY, pick.value);
    pick.value = "";
    this.renderExport();
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
