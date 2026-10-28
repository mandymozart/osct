import { BottomSheet, SHEET_CSS } from "@/components/dev-tools";
import {
  getPreview, PREVIEW_BACKDROPS, PREVIEW_VIEWS, PreviewBackdrop, PreviewState, PreviewView, setTargetHidden, subscribePreview,
  updatePreview,
} from "@/components/ar-bridges";
import { GameStoreService } from "@/services";
import { IGame } from "@/types";
import { getTargets } from "@/utils/game-config";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The photo behind the stage is stored on the device: long side at most this many pixels */
const PHOTO_MAX_PX = 1600;
/** Hide → show again: the outro (0.7 s) ends before the target is found again */
const REPLAY_GAP_MS = 900;

/**
 * The editor's preview panel (a bottom sheet like the debug panels): the simulated camera's **view** (presets;
 * drag, wheel and pinch on the stage move it freely, double tap = reader), **found** per target of the current
 * spread (off = lost → outro, on = found → reveal), **unlock** replays the first find of every shown target (the
 * unlock animation and the found indicator), **wobble** adds a hand's shake, **backdrop** table / paper / a photo of
 * the author's own desk. Settings persist on the device (`utils/preview.ts`).
 */
export class PreviewPanel extends HTMLElement {
  private shadow: ShadowRoot;
  private game: Readonly<IGame>;
  private cleanups: Array<() => void> = [];
  private sheet: BottomSheet;
  private replayTimers: number[] = [];

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.shadow = this.attachShadow({ mode: "open" });
    this.sheet = new BottomSheet(this, this.shadow, { label: "Preview", heightKey: "osct-sheet-preview-height", defaultHeight: () => 170 });
  }

  connectedCallback() {
    this.sheet.connect();
    this.cleanups.push(
      this.game.subscribeToProperty("currentSpread", () => this.render()),
      this.game.subscribeToProperty("trackedTargets", () => this.renderTargets(getPreview())),
      subscribePreview(state => this.renderState(state)),
    );
    this.shadow.addEventListener("click", this.onClick);
    this.shadow.addEventListener("input", this.onInput);
    this.shadow.addEventListener("change", this.onChange);
    this.render();
  }

  disconnectedCallback() {
    this.sheet.disconnect();
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    this.replayTimers.forEach(timer => window.clearTimeout(timer));
    this.replayTimers = [];
    this.shadow.removeEventListener("click", this.onClick);
    this.shadow.removeEventListener("input", this.onInput);
    this.shadow.removeEventListener("change", this.onChange);
  }

  private targets() {
    const spread = this.game.state.currentSpread;
    return spread ? getTargets(spread).filter(target => target.imageSrc) : [];
  }

  private render() {
    this.sheet.render(() => {
      const state = getPreview();
      this.shadow.innerHTML = /* html */ `
        <style>
          ${SHEET_CSS}
          .body { display: flex; flex-direction: column; gap: .3rem; }
          .row { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; }
          .row > span:first-child { color: #9c9; min-width: 4.5rem; }
          .small { color: #9c9; }
          .title { color: #fff; margin-right: auto; }
          input[type=range] { width: 7rem; accent-color: #0f0; margin: 0 .25rem; }
          input[type=file] { display: none; }
          button.target.on { background: #0f0; color: #000; }
        </style>
        <div class="bar">
          <span class="title">Preview – no camera</span>
          <span class="small">drag = orbit · wheel / pinch = distance · double tap = reader</span>
          <button class="close" data-action="close" aria-label="Close">×</button>
        </div>
        <div class="body">
          <div class="row views"><span>view</span>${PREVIEW_VIEWS.map(view =>
            `<button data-view="${view}" class="${state.view === view && !state.orbit ? "on" : ""}">${view}</button>`).join("")}
            <span class="small orbit"></span></div>
          <div class="row targets"><span>found</span></div>
          <div class="row"><span>wobble</span><input type="range" data-action="wobble" min="0" max="1" step="0.05" value="${state.wobble}" aria-label="Hand shake">
            <span class="small wobble-value">${state.wobble.toFixed(2)}</span></div>
          <div class="row backdrops"><span>backdrop</span>${PREVIEW_BACKDROPS.map(backdrop =>
            `<button data-backdrop="${backdrop}" class="${state.backdrop === backdrop ? "on" : ""}">${backdrop}</button>`).join("")}
            <label><button data-action="choose-photo">photo…</button><input type="file" accept="image/*" data-action="photo"></label>
            <span class="small photo-state"></span></div>
        </div>
      `;
      this.renderState(state);
    });
  }

  /** Buttons follow the state (the tracker stores a free orbit, the panel shows it) */
  private renderState(state: PreviewState) {
    this.shadow.querySelectorAll<HTMLButtonElement>("button[data-view]").forEach(button =>
      button.classList.toggle("on", button.dataset.view === state.view && !state.orbit));
    const orbit = this.shadow.querySelector(".orbit");
    if (orbit) orbit.textContent = state.orbit ? `free: ${Math.round(state.orbit.distance)} mm · ${Math.round(state.orbit.tilt)}° · ${Math.round(state.orbit.yaw)}°` : "";
    this.shadow.querySelectorAll<HTMLButtonElement>("button[data-backdrop]").forEach(button =>
      button.classList.toggle("on", button.dataset.backdrop === state.backdrop));
    const photo = this.shadow.querySelector(".photo-state");
    if (photo) photo.textContent = state.backdrop === "photo" && !state.photo ? "choose a photo first" : "";
    const wobble = this.shadow.querySelector<HTMLInputElement>("input[data-action=wobble]");
    if (wobble && document.activeElement !== wobble) wobble.value = String(state.wobble);
    const value = this.shadow.querySelector(".wobble-value");
    if (value) value.textContent = state.wobble.toFixed(2);
    this.renderTargets(state);
  }

  private renderTargets(state: PreviewState) {
    const row = this.shadow.querySelector(".targets");
    if (!row) return;
    const tracked = this.game.state.trackedTargets;
    const targets = this.targets();
    row.innerHTML = `<span>found</span>` + (targets.length
      ? targets.map(target => {
          const shown = !state.hidden.includes(target.id);
          return `<button class="target ${shown ? "on" : ""}" data-target="${escapeHtml(target.id)}" aria-pressed="${shown}">${
            tracked.includes(target.id) ? "◉ " : "○ "}${escapeHtml(target.id)}</button>`;
        }).join("") + `<button data-action="unlock" title="Replay the first find">unlock ↺</button>`
      : `<span class="small">no targets with an image on this spread</span>`);
  }

  /** Every shown target is locked again, hidden, and found anew: the unlock animation plays */
  private replayUnlock() {
    const shown = this.targets().filter(target => !getPreview().hidden.includes(target.id));
    shown.forEach(target => {
      this.game.history.forgetTarget(target.id);
      setTargetHidden(target.id, true);
    });
    this.replayTimers.push(window.setTimeout(() => shown.forEach(target => setTargetHidden(target.id, false)), REPLAY_GAP_MS));
  }

  private async choosePhoto(file: File) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      updatePreview({ photo: canvas.toDataURL("image/jpeg", 0.85), backdrop: "photo" });
    } catch (error) {
      console.warn("[PreviewPanel] The photo could not be read:", error);
    }
  }

  private onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!button) return;
    if (button.dataset.view) return updatePreview({ view: button.dataset.view as PreviewView, orbit: null });
    if (button.dataset.backdrop) return updatePreview({ backdrop: button.dataset.backdrop as PreviewBackdrop });
    if (button.dataset.target) return setTargetHidden(button.dataset.target, !getPreview().hidden.includes(button.dataset.target));
    switch (button.dataset.action) {
      case "close":
        return this.remove();
      case "unlock":
        return this.replayUnlock();
      case "choose-photo":
        return this.shadow.querySelector<HTMLInputElement>("input[data-action=photo]")?.click();
    }
  };

  private onInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.action === "wobble") updatePreview({ wobble: Number(input.value) });
  };

  private onChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.action === "photo" && input.files?.[0]) void this.choosePhoto(input.files[0]);
  };
}

customElements.define("preview-panel", PreviewPanel);
