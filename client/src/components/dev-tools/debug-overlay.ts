import { IGame, LoadingState, TargetData } from "@/types";
import { waitForDOMReady } from "@/utils";
import { getAssets, getChapter, getTarget, getTargets } from "@/utils/config";
import { GameStoreService } from "../../services/GameStoreService";
import { SceneService } from '../../services/SceneService';

export class DebugOverlay extends HTMLElement {
  private shadow: ShadowRoot;
  private subscriptionCleanups: Array<() => void> = [];
  private expanded: boolean = false;
  private game: Readonly<IGame>;
  private sceneService: SceneService;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.sceneService = SceneService.getInstance();
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
      this.game.subscribeToProperty('currentChapter', () => this.updateContent()),
      this.game.subscribeToProperty('chapters', () => this.updateContent()),
      this.game.subscribeToProperty('cameraPermission', () => this.updateContent())
    );
  }

  private setupEventListeners() {
    this.addEventListener("click", this.toggleExpanded.bind(this));
  }
  private removeEventListeners() {
    this.removeEventListener("click", this.toggleExpanded.bind(this));
  }

  private toggleExpanded() {
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
          display: ${import.meta.env.DEV ? "block" : "none"};
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
      </style>
      <div id="content">Loading...</div>
    `;
  }

  private updateContent() {
    const contentEl = this.shadow.getElementById("content");
    if (!contentEl) return;
    const { currentChapter } = this.game.state;
    let html = "";

    // Scene status
    html += `<div class="section">
      <div>Scene: ${
        this.sceneService.getScene()
          ? '<span class="loaded">Attached</span>'
          : '<span class="error">Not Attached</span>'
      }</div>
    </div>`;

    // Current chapter
    if (currentChapter) {
      html += this.renderChapterInfo(currentChapter);
    } else {
      html += `<div class="section">No chapter loaded</div>`;
    }
    
    if(!this.expanded){
      // Add chapter summary
      html = `<div class="section section--summary">
      ${currentChapter ? this.generateChapterSummary(currentChapter) : 'No chapter'}
      </div>`;
    }
    
    contentEl.innerHTML = html;
  }

  private generateChapterSummary(id: string): string {
    const chapter = getChapter(id);
    
    const getStatusDot = (isLoaded: boolean, isError?: boolean) => {
      if (isError) return '<span class="error">◉</span>';
      return isLoaded 
        ? '<span class="loaded">◉</span>' 
        : '<span class="loading">◉</span>';
    };

    // Get scene status
    const sceneStatus = getStatusDot(
      !!this.sceneService.getScene(),
      false
    );

    // Get chapter status
    const chapterStatus = getStatusDot(this.game.state.chapters[id].status === LoadingState.LOADED, false);

    return `
      <div>S${sceneStatus} C${chapterStatus}[${chapter?.id}] T${getTargets(chapter?.id || '').length} A${getAssets(chapter?.id || '').length}</div>
    `;
  }

  private renderChapterInfo(chapterId: string): string {
    const chapter = getChapter(chapterId);
    if (!chapter) {
      return `<div class="section">Unknown chapter: ${chapterId}</div>`;
    }

    let html = `
      <div class="section">
        <div>Chapter: ${chapter.id || "unknown"}</div>
        <div>Status: ${this.getStatusLabel(this.game.state.chapters[chapterId])}</div>
        <qr-generator></qr-generator>
      </div>
    `;

    // Targets
    if (chapter.targets && chapter.targets.length > 0) {
      html += `<div class="section section--targets">`;
      html += `<div>Targets (${chapter.targets.length}):</div><div class="target-list">`;

      chapter.targets.forEach((target, i) => {
        html += this.renderTargetInfo(target, i);
      });

      html += `</div></div>`;
    }

    return html;
  }

  private renderTargetInfo(target: TargetData, index: number): string {
    // Get target configuration
    const targetConfig = getTarget(target.id || '');
    
    let html = `
      <div class="target">
        <div>Target #${index}: ${target.id ? target.id : 'unnamed'}</div>
    `;

    // Add image preview if available
    if (targetConfig && targetConfig.imageTargetSrc) {
      html += `
        <div class="target-image">
          <img src="${targetConfig.imageTargetSrc}" alt="${targetConfig.title || target.id || ''}" />
        </div>
      `;
    }


    
    html += '</div>';
    
    return html;
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
