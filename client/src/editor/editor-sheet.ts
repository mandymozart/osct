import { BottomSheet, MIN_SHEET_HEIGHT } from "@/components/dev-tools";
import {
  getPreview, PREVIEW_BACKDROPS, PREVIEW_VIEWS, PreviewBackdrop, PreviewState, PreviewView, setTargetHidden, subscribePreview,
  updatePreview,
} from "@/components/ar-bridges";
import { GameStoreService } from "@/services";
import { adoptDesignStyles } from "@/styles";
import { IGame } from "@/types";
import { getSpreads, getTargets } from "@/utils/game-config";
import "@/components/common";
import { ICONS } from "./icons";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Tab = "stage" | "entity";
const TABS: Array<{ id: Tab; label: string }> = [{ id: "stage", label: "Stage" }, { id: "entity", label: "Entity" }];
/** The photo behind the stage is stored on the device: long side at most this many pixels */
const PHOTO_MAX_PX = 1600;
/** Hide → show again: the outro (0.7 s) ends before the target is found again */
const REPLAY_GAP_MS = 900;
const OPEN_KEY = "osct-editor-tab";
/** Day or night for the editor's palette – a flag on the device (no UI for it: the system decides; a setting may come later) */
const SCHEME_KEY = "osct-editor-scheme";

/**
 * The editor's one sheet at the bottom of the page: its head is the tab row – ‹ › through the spreads, **Stage** and
 * **Entity**, the close cross leaves the editor. Closed it is only that row and the stage has the rest of the screen;
 * a tab opens its panel to the dragged height, a tap on the open tab closes it. **Stage** = the simulated camera:
 * view presets (drag on the stage orbits, wheel / pinch the distance, double tap = reader), found per target (off =
 * lost → outro, on = found → reveal), replay of the first find, hand shake, backdrop table / paper / a photo of the
 * desk. **Entity** = the `<tune-inspector>` (placement and filters, Copy YAML). Rows of one control height; numbers
 * scrub or type; icons only where a word makes no sense.
 */
export class EditorSheet extends HTMLElement {
  private shadow: ShadowRoot;
  private game: Readonly<IGame>;
  private sheet: BottomSheet;
  private cleanups: Array<() => void> = [];
  private tab: Tab | null = null;
  private replayTimers: number[] = [];

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.shadow = this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadow);
    this.sheet = new BottomSheet(this, this.shadow, { label: "Editor", heightKey: "osct-sheet-editor-height", defaultHeight: () => 260 });
  }

  connectedCallback() {
    this.dataset.theme = "editor"; // the editor token variant (styles/design-styles.ts)
    this.applyScheme(this.storedScheme());
    this.sheet.connect();
    try {
      const stored = localStorage.getItem(OPEN_KEY);
      this.tab = stored === "stage" || stored === "entity" ? stored : null;
    } catch {
      this.tab = null;
    }
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
      const spread = getSpreads().find(s => s.id === this.game.state.currentSpread);
      this.shadow.innerHTML = /* html */ `
        <style>
          /* Structure only – the look comes from the editor token variant (data-theme="editor", styles/design-styles.ts) */
          :host {
            --tool-control: var(--control-height);
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 10000; box-sizing: border-box;
            display: flex; flex-direction: column; overflow: hidden;
            padding-bottom: env(safe-area-inset-bottom);
            background: var(--surface); color: var(--color-on-dark);
            border-top: .0625rem solid var(--line); user-select: none; cursor: default; pointer-events: auto;
          }
          .bar { flex: none; display: flex; align-items: center; gap: .25rem; padding: .25rem .375rem; background: var(--surface-head);
            border-bottom: .0625rem solid var(--line); touch-action: none; cursor: ns-resize; }
          .bar .spread { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .bar .spread .muted { margin-right: .25rem; }
          .body { flex: 1; min-height: 0; overflow-y: auto; padding: .375rem .5rem .75rem; display: flex; flex-direction: column; gap: .125rem; }
          .body[hidden] { display: none; }
          :host .pill, :host .icon-button { height: var(--control-height); min-height: 0; border-radius: var(--control-radius); color: var(--color-on-dark); }
          :host .pill { padding: 0 .625rem; }
          :host .icon-button { width: var(--control-height); }
          :host .pill:hover, :host .icon-button:hover { background-color: var(--hover-background); }
          :host .pill.on, :host .icon-button.on { background-color: var(--pressed-background); color: var(--pressed-color); box-shadow: none; }
          :host .pill.on .gold { background-image: none; color: inherit; -webkit-text-fill-color: currentColor; }
          .bar .tab { background: none; box-shadow: none; }
          .bar .tab.on { background-color: var(--glass-background); color: var(--color-on-dark); }
          .bar .tab .label { background-image: none; color: inherit; -webkit-text-fill-color: currentColor; }
          .bar .icon-button { background: none; box-shadow: none; }
          .row { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); gap: .375rem; align-items: center; min-height: calc(var(--control-height) + .25rem); }
          .row > .label { color: var(--color-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .controls { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; min-width: 0; }
          .seg { display: inline-flex; gap: .125rem; }
          .small { color: var(--color-muted); font-size: var(--text-size-small); }
          scrub-number { width: 5rem; }
          input[type=file] { display: none; }
          .hint { color: var(--color-muted); font-size: var(--text-size-small); padding: .25rem 0 0 4.875rem; }
        </style>
        <div class="bar design">
          <button type="button" class="icon-button" data-action="previous" aria-label="Previous spread" title="Previous spread">${ICONS.previous}</button>
          <button type="button" class="icon-button" data-action="next" aria-label="Next spread" title="Next spread">${ICONS.next}</button>
          <span class="spread"><span class="muted">p.</span>${spread ? escapeHtml(spread.title) : "–"}</span>
          ${TABS.map(tab => `<button type="button" class="pill tab ${this.tab === tab.id ? "on" : ""}" data-tab="${tab.id}" aria-pressed="${this.tab === tab.id}"><span class="label">${tab.label}</span></button>`).join("")}
          <button type="button" class="icon-button" data-action="exit" aria-label="Leave the editor" title="Leave the editor">${ICONS.close}</button>
        </div>
        <div class="body design" data-panel="stage" ${this.tab === "stage" ? "" : "hidden"}>
          <div class="row"><span class="label">view</span><span class="controls"><span class="seg">${PREVIEW_VIEWS.map(view =>
            `<button type="button" class="pill" data-view="${view}" aria-pressed="false">${view}</button>`).join("")}</span><span class="small orbit"></span></span></div>
          <div class="row"><span class="label">found</span><span class="controls targets"></span></div>
          <div class="row"><span class="label">shake</span><span class="controls"><scrub-number data-action="wobble" min="0" max="1" step="0.05" default="0" value="${state.wobble}" label="Hand shake" strict></scrub-number>
            <span class="small">0 = still, 1 = a hand holding the phone</span></span></div>
          <div class="row"><span class="label">backdrop</span><span class="controls"><span class="seg">${PREVIEW_BACKDROPS.map(backdrop =>
            `<button type="button" class="pill" data-backdrop="${backdrop}" aria-pressed="false">${backdrop}</button>`).join("")}</span>
            <button type="button" class="icon-button" data-action="choose-photo" aria-label="Choose a photo of your desk" title="Choose a photo of your desk">${ICONS.camera}</button>
            <input type="file" accept="image/*" data-action="photo"><span class="small photo-state"></span></span></div>
          <div class="hint">drag = orbit · wheel / pinch = distance · double tap = reader</div>
        </div>
        <div class="body" data-panel="entity" ${this.tab === "entity" ? "" : "hidden"}><tune-inspector></tune-inspector></div>
      `;
      this.renderState(state);
      this.applyHeight();
    });
  }

  private storedScheme(): "light" | "dark" | null {
    try {
      const scheme = localStorage.getItem(SCHEME_KEY);
      return scheme === "light" || scheme === "dark" ? scheme : null;
    } catch {
      return null;
    }
  }

  /** The palette's day / night: the stored flag forces one, else the system's */
  private applyScheme(scheme: "light" | "dark" | null) {
    if (scheme) this.dataset.scheme = scheme;
    else delete this.dataset.scheme;
  }

  /** Closed = the head row only; open = the dragged height */
  private applyHeight() {
    if (this.tab) {
      const stored = Number((() => { try { return localStorage.getItem("osct-sheet-editor-height"); } catch { return null; } })());
      this.sheet.setHeight(stored > MIN_SHEET_HEIGHT ? stored : 260);
      return;
    }
    const bar = this.shadow.querySelector<HTMLElement>(".bar");
    this.style.height = bar ? `${bar.offsetHeight + 1}px` : "";
  }

  private setTab(tab: Tab | null) {
    this.tab = this.tab === tab ? null : tab;
    try {
      if (this.tab) localStorage.setItem(OPEN_KEY, this.tab);
      else localStorage.removeItem(OPEN_KEY);
    } catch {
      // storage blocked: the tab holds for this session
    }
    this.shadow.querySelectorAll<HTMLElement>("button[data-tab]").forEach(button => {
      const on = button.dataset.tab === this.tab;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    });
    this.shadow.querySelectorAll<HTMLElement>(".body").forEach(body => (body.hidden = body.dataset.panel !== this.tab));
    this.applyHeight();
  }

  /** Buttons follow the state (the tracker stores a free orbit, the sheet shows it) */
  private renderState(state: PreviewState) {
    this.shadow.querySelectorAll<HTMLButtonElement>("button[data-view]").forEach(button => {
      const on = button.dataset.view === state.view && !state.orbit;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    });
    const orbit = this.shadow.querySelector(".orbit");
    if (orbit) orbit.textContent = state.orbit ? `free · ${Math.round(state.orbit.distance)} mm · ${Math.round(state.orbit.tilt)}° · ${Math.round(state.orbit.yaw)}°` : "";
    this.shadow.querySelectorAll<HTMLButtonElement>("button[data-backdrop]").forEach(button => {
      const on = button.dataset.backdrop === state.backdrop;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    });
    const photo = this.shadow.querySelector(".photo-state");
    if (photo) photo.textContent = state.backdrop === "photo" && !state.photo ? "choose a photo first" : "";
    const wobble = this.shadow.querySelector<HTMLElement>("scrub-number[data-action=wobble]");
    if (wobble && wobble.getAttribute("value") !== String(state.wobble)) wobble.setAttribute("value", String(state.wobble));
    this.renderTargets(state);
  }

  private renderTargets(state: PreviewState) {
    const row = this.shadow.querySelector(".targets");
    if (!row) return;
    const tracked = this.game.state.trackedTargets;
    const targets = this.targets();
    row.innerHTML = targets.length
      ? targets.map(target => {
          const shown = !state.hidden.includes(target.id);
          return `<button type="button" class="pill ${shown ? "on" : ""}" data-target="${escapeHtml(target.id)}" aria-pressed="${shown}"
            title="${shown ? "Found – tap to lose" : "Lost – tap to find"}">${tracked.includes(target.id) ? "◉ " : "○ "}${escapeHtml(target.id)}</button>`;
        }).join("") +
        `<button type="button" class="icon-button" data-action="unlock" aria-label="Replay the first find" title="Replay the first find">${ICONS.replay}</button>`
      : `<span class="small">no targets with an image on this spread</span>`;
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
      console.warn("[EditorSheet] The photo could not be read:", error);
    }
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
    if (button.dataset.tab) return this.setTab(button.dataset.tab as Tab);
    if (button.dataset.view) return updatePreview({ view: button.dataset.view as PreviewView, orbit: null });
    if (button.dataset.backdrop) return updatePreview({ backdrop: button.dataset.backdrop as PreviewBackdrop });
    if (button.dataset.target) return setTargetHidden(button.dataset.target, !getPreview().hidden.includes(button.dataset.target));
    switch (button.dataset.action) {
      case "previous":
        return this.step(-1);
      case "next":
        return this.step(1);
      case "exit":
        return this.game.router.navigate("/spread");
      case "unlock":
        return this.replayUnlock();
      case "choose-photo":
        return this.shadow.querySelector<HTMLInputElement>("input[data-action=photo]")?.click();
    }
  };

  private onInput = (event: Event) => {
    const control = event.target as HTMLElement & { value?: number };
    if (control.dataset?.action === "wobble" && typeof control.value === "number") updatePreview({ wobble: control.value });
  };

  private onChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset?.action === "photo" && input.files?.[0]) void this.choosePhoto(input.files[0]);
  };
}

customElements.define("editor-sheet", EditorSheet);
