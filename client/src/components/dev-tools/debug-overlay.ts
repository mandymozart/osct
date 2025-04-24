import { IGame, LoadingState, Target } from "@/types";
import { waitForDOMReady } from "@/utils";
import { getChapter, getTarget, } from "@/utils/config";
import { GameStoreService } from "../../services/GameStoreService";
import { SceneService } from '../../services/SceneService';

export class DebugOverlay extends HTMLElement {
  private shadow: ShadowRoot;
  private unsubscribe: (() => void) | null = null;
  private expanded: boolean = false;
  private game: Readonly<IGame>;
  private sceneService: SceneService; // declare sceneService as a class property

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.sceneService = SceneService.getInstance(); // initialize sceneService in the constructor
    this.shadow = this.attachShadow({ mode: "open" });

    // Hide in production
    if (!import.meta.env.DEV && !import.meta.env.VITE_DEBUG) {
      this.style.display = "none";
    }
    console.log('[DebugOverlay] constructor')
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
  }

  private setupListeners() {
    this.unsubscribe = this.game.subscribe(this.updateContent.bind(this));
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
        .target, .entity, .asset {
          padding: .25rem 0;
          }
        .entity { margin-left: 0rem; }
        .asset { margin-left: 1rem; }
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

    if (!this.expanded) {
      // When collapsed, only show summary
      const summary = currentChapter
        ? this.generateChapterSummary(currentChapter)
        : "No chapter loaded";
      html = `<div class="section section--summary">${summary}</div>`;
    }

    contentEl.innerHTML = html;
  }

  private generateChapterSummary(id: string): string {
    const chapter = getChapter(id);
    
    const entityStats = this.game.entities.getLoadingStatus();
    const assetStats = this.game.assets.getLoadingStatus();

    const isChapterLoaded = this.game.chapters.isLoaded(id);
    
    const getStatusDot = (isLoaded: boolean, isError?: boolean) => {
      if (isError) return '<span class="error">◉</span>';
      return isLoaded
        ? '<span class="loaded">◉</span>'
        : '<span class="loading">◉</span>';
    };

    const sceneStatus = getStatusDot(
      !!this.sceneService.getScene(),
      false
    );
    const chapterStatus = getStatusDot(isChapterLoaded);
    const targetsStatus = getStatusDot(entityStats.loaded === entityStats.total && entityStats.total > 0);
    const entitiesStatus = getStatusDot(entityStats.loaded === entityStats.total && entityStats.total > 0);
    const assetsStatus = getStatusDot(assetStats.loaded === assetStats.total && assetStats.total > 0);

    return `
      <div>S${sceneStatus} C${chapterStatus}${chapter?.id} E${entitiesStatus}${entityStats.loaded}/${entityStats.total} A${assetsStatus}${assetStats.loaded}/${assetStats.total}</div>
    `;
  }

  private renderChapterInfo(id: string): string {
    const chapter = getChapter(id);
    if (!chapter) return "";
    let html = `
      <div class="section">
        <div>Chapter: ${chapter.id || "unknown"}</div>
        <div>Status: ${this.getStatusLabel(chapter)}</div>
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

  private renderTargetInfo(target: Target, index: number): string {
    // Get the target's entity ID
    const entityId = `${target.id}`;
    
    // Get entity state if it exists
    const entityState = this.game.state.entities[entityId];
    
    // Get target configuration
    const targetConfig = getTarget(entityId);
    
    let html = `
      <div class="target">
        <div>Target #${index}: ${target.id ? target.id : 'unnamed'}</div>
    `;

    // Add image preview if available
    if (targetConfig && targetConfig.imageTargetSrc) {
      html += `
        <div class="target-image">
          <img src="${targetConfig.imageTargetSrc}" alt="${targetConfig.title || target.id}" />
        </div>
      `;
    }

    if (entityState) {
      html += `
        <div class="entity">
          <div>Status: ${this.getStatusLabel(entityState)}</div>
      `;

      // Get assets configuration for this target entity
      const assetConfigs = targetConfig?.entity?.assets || [];
      
      if (assetConfigs.length > 0) {
        html += `<div class="entity">Assets (${assetConfigs.length}):</div>`;

        assetConfigs.forEach((assetConfig, i) => {
          // Get asset state from the game state
          const assetState = this.game.state.assets[assetConfig.id];
          
          html += `
            <div class="asset">
              Asset #${i}: (${assetConfig.assetType || "unknown"})
              ${assetState ? this.getStatusLabel(assetState) : '<span class="info">N/A</span>'}
              ${
                assetState?.error
                  ? `<div class="error">${assetState.error.message || assetState.error}</div>`
                  : ""
              }
              <div class="asset-meta">ID: ${assetConfig.id || "unnamed"}</div>
              ${assetConfig.src ? 
                `<div class="info">Source: ${this.truncateFilePath(assetConfig.src)}</div>` 
                : ''}
            </div>
          `;
        });
      }

      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  private getStatusLabel(resource: any): string {
    // First check if the resource uses the LoadingState enum via status property
    if (resource.status !== undefined) {
      switch (resource.status) {
        case LoadingState.INITIAL:
          return '<span class="info">Initial</span>';
        case LoadingState.LOADING:
          return '<span class="loading">Loading...</span>';
        case LoadingState.LOADED:
          return '<span class="loaded">Loaded</span>';
        case LoadingState.ERROR:
          return `<span class="error">${
            resource.error?.code || "unknown"
          }</span>`;
        default:
          return '<span class="info">Unknown</span>';
      }
    }

    // Fallback to legacy loading state properties
    if (resource.isLoading) {
      return '<span class="loading">Loading...</span>';
    } else if (resource.error) {
      return `<span class="error">${
        resource.error.code || "unknown"
      }</span>`;
    } else if (resource.loaded) {
      return '<span class="loaded">Loaded</span>';
    } else {
      return '<span class="info">Idle</span>';
    }
  }

  /**
   * Truncates a file path to show only the filename with an ellipsis
   * For example: "/long/path/to/scene.gltf" becomes ".../scene.gltf"
   */
  private truncateFilePath(path: string): string {
    if (!path) return "";
    const parts = path.split("/");
    if (parts.length <= 1) return path;

    // Get the filename (last part)
    const filename = parts[parts.length - 1];
    return `.../${filename}`;
  }
}
if (import.meta.env.DEV && import.meta.env.VITE_DEBUG) {
  customElements.define("debug-overlay", DebugOverlay);
}
