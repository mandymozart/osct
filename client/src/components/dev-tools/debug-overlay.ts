import { IGame, LoadingState, Target } from "@/types";
import { waitForDOMReady } from "@/utils";
import { getAssets, getEntries, getEntry, getSpread, getTargets } from "@/utils/game-config";
import { GameStoreService } from "../../services/GameStoreService";

type DebugTab = "spread" | "progress";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatTime = (time: number) => new Date(time).toLocaleString();

export class DebugOverlay extends HTMLElement {
  private shadow: ShadowRoot;
  private subscriptionCleanups: Array<() => void> = [];
  private expanded: boolean = false;
  private tab: DebugTab = "spread";
  private game: Readonly<IGame>;

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
    // The collapsed line covers the top; app chrome (Mark) moves down by this much in dev
    document.documentElement.style.setProperty("--debug-offset", "1.25rem");
    this.render();
    this.initialize();
  }

  protected disconnectedCallback() {
    this.removeEventListeners();
    // Clean up all subscriptions
    this.subscriptionCleanups.forEach(cleanup => cleanup());
    this.subscriptionCleanups = [];
  }

  private setupListeners() {
    // Subscribe to properties we need for the debug overlay
    this.subscriptionCleanups.push(
      this.game.subscribeToProperty('currentSpread', () => this.updateContent()),
      this.game.subscribeToProperty('spreads', () => this.updateContent()),
      this.game.subscribeToProperty('cameraPermission', () => this.updateContent()),
      this.game.subscribeToProperty('progress', () => this.updateContent()),
      this.game.subscribeToProperty('arStatus', () => this.updateContent())
    );
  }

  private setupEventListeners() {
    this.addEventListener("click", this.toggleExpanded.bind(this));
  }
  private removeEventListeners() {
    this.removeEventListener("click", this.toggleExpanded.bind(this));
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
    this.expanded = !this.expanded;
    this.updateContent();
  }

  private render() {
    this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          top: 0;
          right: .25rem;
          left: 0.25rem;
          max-height: calc(100vh - 6rem);
          background-color: rgba(0, 0, 0, 0.7);
          color: #00ff00;
          font-family: monospace;
          font-size: .75rem;
          padding: .1rem .5rem;
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
          border-bottom: 1px solid #0F0;
        }
        .section--summary, .section-summary {
          border: none;
        }
        .loading { color: orange; }
        .loaded { color: lime; }
        .error { color: red; }
        .info { color: cyan; }
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
        .tabs { display: flex; gap: .25rem; margin: .25rem 0; }
        button {
          font: inherit;
          color: inherit;
          background: none;
          border: 1px solid #0F0;
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
      .join("")}</div>`;

    if (this.expanded && this.tab === "progress") {
      contentEl.innerHTML = html + this.renderProgress();
      return;
    }

    // Scene status
    html += `<div class="section">
      <div>AR: ${this.arStatusLabel()}</div>
    </div>`;

    // Current spread
    if (currentSpread) {
      html += this.renderSpreadInfo(currentSpread);
    } else {
      html += `<div class="section">No spread loaded</div>`;
    }
    
    if(!this.expanded){
      // Add spread summary
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

    // AR status (Phase 6): green = running, orange = on its way / paused, red = error
    const arStatus = this.game.state.arStatus;
    const sceneStatus = getStatusDot(arStatus === "running", arStatus === "error");

    // Get spread status
    const spreadStatus = getStatusDot(this.game.state.spreads[id].status === LoadingState.LOADED, false);

    // Progress: unlocked targets / consulted entries (whole book)
    const { unlocked, consulted } = this.game.state.progress;

    return `
      <div>S${sceneStatus} C${spreadStatus}[${spread?.id}] T${getTargets(spread?.id || '').length} A${getAssets(spread?.id || '').length} U${Object.keys(unlocked).length} K${Object.keys(consulted).length}</div>
    `;
  }

  /**
   * Progress record (PLAN Phase 2): ids no longer in the content are kept in storage and marked here
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
      ${table("Marked entries", timeRows(progress.marked))}
      ${table("Notes", Object.entries(progress.notes).map(([id, note]) => [id, escapeHtml(note)]))}
      <div class="section section--summary">
        <button data-action="reset-progress">Reset progress</button>
      </div>
    `;
  }

  private renderSpreadInfo(spreadId: string): string {
    const spread = getSpread(spreadId);
    if (!spread) {
      return `<div class="section">Unknown spread: ${spreadId}</div>`;
    }

    let html = `
      <div class="section">
        <div>Spread: ${spread.id || "unknown"}</div>
        <div>Status: ${this.getStatusLabel(this.game.state.spreads[spreadId])}</div>
        <qr-generator></qr-generator>
      </div>
    `;

    // Targets
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

    // Add image preview if available
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

  private arStatusLabel(): string {
    const status = this.game.state.arStatus;
    const css = status === "running" ? "loaded" : status === "error" ? "error" : "loading";
    return `<span class="${css}">${status}</span>`;
  }

  private getStatusLabel(state: { status: LoadingState; error?: Error }): string {
    switch (state.status) {
      case LoadingState.INITIAL:
        return '<span class="loading">Initial</span>';
      case LoadingState.LOADING:
        return '<span class="loading">Loading</span>';
      case LoadingState.LOADED:
        return '<span class="loaded">Loaded</span>';
      case LoadingState.ERROR:
        const errorMsg = state.error ? state.error.message || 'Error' : 'Error';
        return `<span class="error">Error: ${errorMsg}</span>`;
      default:
        return '<span class="info">Unknown</span>';
    }
  }
}

if (import.meta.env.DEV || import.meta.env.VITE_DEBUG) {
  customElements.define("debug-overlay", DebugOverlay);
}
