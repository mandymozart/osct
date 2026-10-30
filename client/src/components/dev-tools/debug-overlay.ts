import type { IGame, Target } from "@/types";
import { waitForDOMReady } from "@/utils";
import { getConfigVersion, getEntries, getEntry, getSpread, getTargets } from "@/utils/game-config";
import { GameStoreService } from "@/services";
import {
  cyclePreparedSpreadRange, getArError, getEngineState, getStoredWindowSetting, getWindowOverride, subscribeCamera,
  subscribeEngineState,
} from "@/components/ar-bridges";

type DebugTab = "spread" | "progress";
/** The bottom panels the overlay opens (`<name>-panel`), at most one at a time */
const PANELS = ["camera", "trial", "load-test"];

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatTime = (time: number) => new Date(time).toLocaleString();

/**
 * Development overlay: a one-line status summary – AR status dot, T<targets on the spread>, E<ready>/<held> in the
 * engine; the rest is in the expanded view (the line stays one line)
 * that expands on tap into spread, target and progress details, and opens the
 * camera test panel (`<camera-panel>`), the trigger trial panel (`<trial-panel>`) or the engine load test (`<load-test-panel>`).
 * Sets `--debug-offset` so app chrome moves below the collapsed line.
 */
export class DebugOverlay extends HTMLElement {
  private shadow: ShadowRoot;
  private subscriptionCleanups: Array<() => void> = [];
  private expanded: boolean = false;
  private tab: DebugTab = "spread";
  /** The spread's QR code (opens the app on a phone) – hidden until asked for, it fills a phone screen */
  private showQr = false;
  private game: Readonly<IGame>;
  // One reference for add and remove – `bind` would make a new function each time and nothing would be removed
  private readonly onClick = (event: Event) => this.toggleExpanded(event);

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  private async initialize(): Promise<void> {
    try {
      waitForDOMReady();
      this.updateContent();
      this.setupListeners();
      this.setupEventListeners();
    } catch (error) {
      console.error("Error initializing DebugOverlay:", error);
    }
  }

  protected connectedCallback() {
    // The collapsed line covers the top of the screen; app chrome moves down by this offset
    document.documentElement.style.setProperty("--debug-offset", "1.25rem");
    this.render();
    this.initialize();
  }

  protected disconnectedCallback() {
    this.removeEventListeners();
    this.subscriptionCleanups.forEach(cleanup => cleanup());
    this.subscriptionCleanups = [];
  }

  private setupListeners() {
    this.subscriptionCleanups.push(
      this.game.subscribeToProperty('currentSpread', () => this.updateContent()),
      this.game.subscribeToProperty('cameraPermission', () => this.updateContent()),
      this.game.subscribeToProperty('progress', () => this.updateContent()),
      this.game.subscribeToProperty('arStatus', () => this.updateContent()),
      this.game.subscribeToProperty('trackedTargets', () => this.updateContent()),
      subscribeEngineState(() => this.updateContent()),
      subscribeCamera(() => this.updateContent()),
    );
  }

  private setupEventListeners() {
    this.addEventListener("click", this.onClick);
  }
  private removeEventListeners() {
    this.removeEventListener("click", this.onClick);
  }

  private toggleExpanded(event: Event) {
    // Controls inside the expanded overlay don't collapse it
    const control = event.composedPath().find(
      (el): el is HTMLElement => el instanceof HTMLElement && !!(el.dataset.tab || el.dataset.action),
    );
    if (control?.dataset.tab) {
      this.tab = control.dataset.tab as DebugTab;
      this.updateContent();
      return;
    }
    if (control?.dataset.action === "reset-progress") {
      if (confirm("Reset the progress of this book?")) this.game.history.reset();
      return;
    }
    if (control?.dataset.action === "copy-progress") {
      void this.copyProgress(control);
      return;
    }
    if (control?.dataset.action === "toggle-qr") {
      this.showQr = !this.showQr;
      this.updateContent();
      return;
    }
    if (control?.dataset.action === "collapse") {
      this.expanded = false;
      this.updateContent();
      return;
    }
    if (control?.dataset.action && PANELS.includes(control.dataset.action)) {
      // The panels sit at the bottom; the overlay collapses so the scene stays in view
      const name = `${control.dataset.action}-panel`;
      const panel = document.querySelector(name);
      document.querySelectorAll(PANELS.map(panel => `${panel}-panel`).join(", ")).forEach(open => open.remove());
      if (!panel) document.body.appendChild(document.createElement(name));
      this.expanded = false;
      this.updateContent();
      return;
    }
    if (control?.dataset.action === "cycle-prepared") {
      // Spreads kept loaded around the current one – applies at once (the scene re-prepares its window)
      cyclePreparedSpreadRange();
      this.updateContent();
      return;
    }
    this.expanded = !this.expanded;
    this.updateContent();
  }

  private render() {
    this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          /* Collapsed height must equal --debug-offset (1rem line + 2 × .125rem padding = 1.25rem) */
          top: env(safe-area-inset-top);
          box-sizing: border-box;
          line-height: 1rem;
          right: .25rem;
          left: 0.25rem;
          max-height: calc(100vh - 6rem);
          background-color: rgba(0, 0, 0, 0.7);
          color: #00ff00;
          font-family: monospace;
          font-size: .75rem;
          padding: .125rem .5rem;
          border-radius: 0 0 .5rem 0.5rem;
          z-index: 9999;
          overflow-y: auto;
          user-select: text;
          cursor: pointer;
          transition: opacity 0.3s;
          display: "block";
        }
        .title {
          font-weight: bold;
          font-size: .75rem;
          margin-bottom: .5rem;
          text-align: center;
          color: #ffffff;
        }
        .section {
          border-bottom: 0.0625rem solid #0F0;
        }
        .section--summary, .section-summary {
          border: none;
        }
        .loading { color: orange; }
        .loaded { color: lime; }
        .error { color: red; }
        .info { color: cyan; }
        .small { font-size: .6875rem; color: #9c9; overflow-wrap: anywhere; }
        .target-list {
          display: flex;
          overflow-x: auto;
          gap: .5rem;
        }
        .target img {
          display: block;
          aspect-ratio: 1/1;
          width: 16rem;
          object-fit: contain;
          background: white;
          padding: .5rem;
        }
        .target {
          padding: .25rem 0;
        }
        .toggle { cursor: pointer; }
        .tabs { display: flex; flex-wrap: wrap; gap: .25rem; margin: .25rem 0; }
        .tabs .collapse { margin-left: auto; }
        button {
          font: inherit;
          color: inherit;
          background: none;
          border: 0.0625rem solid #0F0;
          padding: 0 .5rem;
          cursor: pointer;
        }
        button.active { background: #0F0; color: #000; }
        table { border-collapse: collapse; width: 100%; }
        td { padding: 0 .5rem 0 0; vertical-align: top; width: 50%; }
        td + td { color: #ccc; }
      </style>
      <div id="content">Loading...</div>
    `;
  }

  private updateContent() {
    const contentEl = this.shadow.getElementById("content");
    if (!contentEl) return;
    const { currentSpread } = this.game.state;
    let html = `<div class="tabs">${(["spread", "progress"] as DebugTab[])
      .map(tab => `<button data-tab="${tab}" class="${tab === this.tab ? "active" : ""}">${tab}</button>`)
      .join("")}${PANELS.map(panel => `<button data-action="${panel}">${panel === "load-test" ? "load" : panel}</button>`).join("")}<button class="collapse" data-action="collapse" aria-label="Close">×</button></div>`;

    if (this.expanded && this.tab === "progress") {
      contentEl.innerHTML = html + this.renderProgress();
      return;
    }

    // Scene status
    html += `<div class="section">
      <div>AR: ${this.arStatusLabel()}</div>
      <div>Spreads held: ${this.preparedLabel()}
        <button data-action="cycle-prepared">Change</button></div>
      ${this.renderEngine()}
    </div>`;

    if (currentSpread) {
      html += this.renderSpreadInfo(currentSpread);
    } else {
      html += `<div class="section">No spread loaded</div>`;
    }
    
    if(!this.expanded){
      html = `<div class="section section--summary">
      ${currentSpread ? this.generateSpreadSummary(currentSpread) : 'No spread'}
      </div>`;
    }
    
    contentEl.innerHTML = html;
  }

  private generateSpreadSummary(id: string): string {
    const spread = getSpread(id);
    
    const getStatusDot = (isLoaded: boolean, isError?: boolean) => {
      if (isError) return '<span class="error">◉</span>';
      return isLoaded 
        ? '<span class="loaded">◉</span>' 
        : '<span class="loading">◉</span>';
    };

    // AR status: green = running, orange = starting / paused, red = error
    const arStatus = this.game.state.arStatus;
    const sceneStatus = getStatusDot(arStatus === "running", arStatus === "error");

    return `
      <div>${sceneStatus} T${getTargets(spread?.id || '').length} ${this.engineSummary()}</div>
    `;
  }

  /**
   * Progress record. Ids no longer present in the content stay in storage and are marked as missing here.
   */
  private renderProgress(): string {
    const progress = this.game.state.progress;
    const missing = this.game.history.getMissingIds();
    const missingIds = new Set([...missing.targets, ...missing.entries]);
    const idCell = (id: string) =>
      missingIds.has(id) ? `<span class="error">${escapeHtml(id)} (missing)</span>` : escapeHtml(id);

    const table = (title: string, rows: [string, string][], total?: number) => `
      <div class="section">
        <div>${title} (${rows.length}${total !== undefined ? ` / ${total}` : ""})</div>
        ${rows.length
          ? `<table>${rows.map(([id, value]) => `<tr><td>${idCell(id)}</td><td>${value}</td></tr>`).join("")}</table>`
          : '<div class="info">–</div>'}
      </div>`;
    const timeRows = (record: Record<string, number>): [string, string][] =>
      Object.entries(record)
        .sort((a, b) => b[1] - a[1])
        .map(([id, time]) => [id, formatTime(time)]);

    return `
      <div class="section">
        <div>Book: ${escapeHtml(progress.bookId)} · format ${progress.format}</div>
        <div>App versions: ${escapeHtml(progress.appVersions.join(" → ") || "–")}</div>
        <div>Last spread: ${escapeHtml(progress.lastSpreadId ?? "–")} · last category: ${escapeHtml(progress.lastCategory ?? "–")}</div>
        <div>Missing from content: ${missingIds.size
          ? `<span class="error">${missing.targets.length} targets, ${missing.entries.length} entries</span>`
          : '<span class="loaded">none</span>'}</div>
      </div>
      ${table("Unlocked targets", timeRows(progress.unlocked), getEntries().filter(e => e.target).length)}
      ${table("Consulted entries", timeRows(progress.consulted), getEntries().length)}
      <div class="section section--summary">
        <button data-action="reset-progress">Reset progress</button>
        <button data-action="copy-progress">Copy</button>
      </div>
    `;
  }

  /**
   * The progress as text (a test record): app version, content hash, device, then every unlocked target
   * and consulted entry with its time, oldest first.
   */
  progressText(): string {
    const progress = this.game.state.progress;
    const rows = (record: Record<string, number>) =>
      Object.entries(record).sort((a, b) => a[1] - b[1]).map(([id, time]) => `${new Date(time).toISOString()} ${id}`);
    const targets = getEntries().filter(e => e.target).length;
    return [
      `OSCT progress · book ${progress.bookId} · app ${__VITE_APP_VERSION__} · content ${(getConfigVersion().hash ?? "").slice(0, 12)}`,
      `${new Date().toISOString()} · ${navigator.userAgent}`,
      `Unlocked targets (${Object.keys(progress.unlocked).length} / ${targets}):`,
      ...rows(progress.unlocked),
      `Consulted entries (${Object.keys(progress.consulted).length} / ${getEntries().length}):`,
      ...rows(progress.consulted),
    ].join("\n");
  }

  private async copyProgress(button: HTMLElement) {
    const text = this.progressText();
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // No clipboard API (http on a LAN address): copy through a selected text field
      const area = document.createElement("textarea");
      area.value = text;
      this.shadow.appendChild(area);
      area.select();
      copied = document.execCommand("copy");
      area.remove();
    }
    button.textContent = copied ? "Copied" : "Copy failed";
    setTimeout(() => (button.textContent = "Copy"), 1500);
  }

  private renderSpreadInfo(spreadId: string): string {
    const spread = getSpread(spreadId);
    if (!spread) {
      return `<div class="section">Unknown spread: ${spreadId}</div>`;
    }

    let html = `
      <div class="section">
        <div>Spread: ${spread.id || "unknown"}
          <button data-action="toggle-qr" class="${this.showQr ? "active" : ""}">QR</button></div>
        ${this.showQr ? "<qr-generator></qr-generator>" : ""}
      </div>
    `;

    if (spread.targets && spread.targets.length > 0) {
      html += `<div class="section section--targets">`;
      html += `<div>Targets (${spread.targets.length}):</div><div class="target-list">`;

      spread.targets.forEach((target, i) => {
        html += this.renderTargetInfo(target, i);
      });

      html += `</div></div>`;
    }

    return html;
  }

  private renderTargetInfo(target: Target, index: number): string {
    const entry = getEntry(target.entryId);
    
    let html = `
      <div class="target">
        <div>Target #${index}: ${target.id ? target.id : 'unnamed'}</div>
    `;

    if (target.imageSrc) {
      html += `
        <div class="target-image">
          <img src="${target.imageSrc}" alt="${entry?.title || target.id}" />
        </div>
      `;
    }


    
    html += '</div>';
    
    return html;
  }

  /**
   * What the engine holds right now: the current spread (◉) and the spreads next to it with their target
   * counts, how many targets are extracted (can be found), and spreads still being prepared
   */
  private renderEngine(): string {
    const engine = getEngineState();
    if (!engine.current && !engine.held.length) return `<div>Engine: <span class="small">no targets (camera off)</span></div>`;
    const spreads = [
      ...(engine.current ? [`<span class="loaded">◉ ${escapeHtml(engine.current.spreadId)} (${engine.current.targets})</span>`] : []),
      ...engine.held.map(spread => `${escapeHtml(spread.spreadId)} (${spread.targets})`),
    ];
    // A grown window lists the whole book: show the nearest few and the count
    const listed = spreads.length > 12 ? [...spreads.slice(0, 12), `+${spreads.length - 12} more`] : spreads;
    const extracting = engine.extractingSince !== null
      ? ` · <span class="loading">extracting ${Math.round((performance.now() - engine.extractingSince) / 1000)} s</span>`
      : "";
    const growing = engine.growing === null ? ""
      : engine.growing > 0 ? ` · <span class="loading">growing, ${engine.growing} spreads to add</span>`
      : extracting ? "" : ' · <span class="loaded">grown</span>';
    return `<div>Engine: ${engine.ready}/${engine.targets} targets ready in ${spreads.length} spreads${extracting}${growing}${engine.budget !== null ? ` · <span class="loading">load test: ${engine.budget === Infinity ? "all" : engine.budget} targets</span>` : ""}</div>
      <div class="small">${listed.join(" · ")}</div>
      ${engine.preparing.length ? `<div class="small">preparing: ${engine.preparing.map(escapeHtml).join(" · ")}</div>` : ""}
      <div>Engine sees: ${engine.seen.length ? engine.seen.map(escapeHtml).join(" · ") : '<span class="small">nothing</span>'}</div>
      ${engine.lastSwitch ? `<div class="small">Last auto switch: ${escapeHtml(engine.lastSwitch.spreadId)} via ${escapeHtml(engine.lastSwitch.targetId)}, ${Math.round((Date.now() - engine.lastSwitch.at) / 1000)} s ago</div>` : ""}`;
  }

  /** E<ready>/<held>: targets the engine can find / holds (orange while it extracts) */
  private engineSummary(): string {
    const engine = getEngineState();
    if (!engine.targets) return "E0";
    return `<span class="${engine.extractingSince !== null ? "loading" : "loaded"}">E${engine.ready}/${engine.targets}</span>`;
  }

  /** ±n spreads, or the whole book (all targets loaded) */
  private preparedLabel(): string {
    const label = (setting: ReturnType<typeof getStoredWindowSetting>) =>
      setting === "grow" ? "grow (whole book in idle time)" : setting === Infinity ? "all" : `±${setting}`;
    const override = getWindowOverride();
    const stored = label(getStoredWindowSetting());
    return override === null ? stored : `${label(override)} while trial is open (then ${stored})`;
  }

  private arStatusLabel(): string {
    const status = this.game.state.arStatus;
    const css = status === "running" ? "loaded" : status === "error" ? "error" : "loading";
    const error = status === "error" ? getArError() : null;
    return `<span class="${css}">${status}</span>${error ? ` <span class="small">${escapeHtml(error)}</span>` : ""}`;
  }
}

if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true") {
  customElements.define("debug-overlay", DebugOverlay);
}
