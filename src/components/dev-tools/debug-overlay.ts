import { waitForDOMReady } from "@/utils";
import { GameStoreService } from "../../services/GameStoreService";
import { ChapterResource, IGame, LoadingState, Target } from "../../types";

export class DebugOverlay extends HTMLElement {
  private shadow: ShadowRoot;
  private unsubscribe: (() => void) | null = null;
  private expanded: boolean = false;
  private game: Readonly<IGame>;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.shadow = this.attachShadow({ mode: "open" });

    // Hide in production
    if (!import.meta.env.DEV && !import.meta.env.DEBUG) {
      this.style.display = "none";
    }
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
    const { currentChapter, scene } = this.game.state;
    let html = "";

    // Scene status
    html += `<div class="section">
      <div>Scene: ${
        scene
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

  private generateChapterSummary(chapter: ChapterResource): string {
    const targets = chapter.targets || [];
    const loadedTargets = targets.filter(
      (t) => t.status === LoadingState.LOADED
    ).length;

    // Count entities and assets
    let totalEntities = 0;
    let loadedEntities = 0;
    let totalAssets = 0;
    let loadedAssets = 0;

    targets.forEach((target) => {
      if (target.entity) {
        totalEntities++;
        if (target.entity.status === LoadingState.LOADED) loadedEntities++;

        if (target.entity.assets) {
          totalAssets += target.entity.assets.length;
          loadedAssets += target.entity.assets.filter(
            (a) => a.status === LoadingState.LOADED
          ).length;
        }
      }
    });

    const getStatusDot = (isLoaded: boolean, isError?: boolean) => {
      if (isError) return '<span class="error">◉</span>';
      return isLoaded
        ? '<span class="loaded">◉</span>'
        : '<span class="loading">◉</span>';
    };

    const sceneStatus = getStatusDot(
      !!this.game.state.scene,
      !this.game.state.scene
    );
    const chapterStatus = getStatusDot(chapter.status === LoadingState.LOADED);
    const targetsStatus = getStatusDot(loadedTargets === targets.length);
    const entitiesStatus = getStatusDot(loadedEntities === totalEntities);
    const assetsStatus = getStatusDot(loadedAssets === totalAssets);

    return `
      <div>S${sceneStatus} C${chapterStatus}${chapter.id} T${targetsStatus}${loadedTargets}/${targets.length} E${entitiesStatus}${loadedEntities}/${totalEntities} A${assetsStatus}${loadedAssets}/${totalAssets}</div>
    `;
  }

  private renderChapterInfo(chapter: ChapterResource): string {
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
    let html = `
      <div class="target">
        <div>Target #${index}: ${this.getStatusLabel(target)}</div>
        <div><img src="assets/images/images-${target.bookId}.jpg" alt="${target.title}" /></div>
    `;

    if (target.entity) {
      html += `
        <div class="entity">
          <div>Entity: ${this.getStatusLabel(target.entity)}</div>
      `;

      if (target.entity.assets && target.entity.assets.length > 0) {
        html += `<div class="entity">Assets (${target.entity.assets.length}):</div>`;

        target.entity.assets.forEach((asset, i) => {
          html += `
            <div class="asset">
              Asset #${i}: (${asset.type || "unknown"})
              ${this.getStatusLabel(asset)}
              ${
                asset.error
                  ? `<div class="error">${asset.error.msg}</div>`
                  : ""
              }
              <div class="asset-meta">ID: ${asset.id || "unnamed"}</div>
              <div class="info">Source: ${this.truncateFilePath(
                asset.src
              )}</div>
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

if (import.meta.env.DEV) {
  customElements.define("debug-overlay", DebugOverlay);
}
