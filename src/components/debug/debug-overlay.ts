import { GameStoreService } from "../../services/GameStoreService";
import { ChapterResource, LoadingState, Target } from "../../types";

export class DebugOverlay extends HTMLElement {
  private shadow: ShadowRoot;
  private unsubscribe: (() => void) | undefined;
  private expanded: boolean = true;
  private gameStore = GameStoreService.getInstance().getGame();

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.render();
    
    if (this.gameStore) {
      this.unsubscribe = this.gameStore.subscribe(this.updateContent.bind(this));
    } else {
      console.error("Could not access game store in debug overlay");
    }
    
    this.addEventListener("click", this.toggleExpanded.bind(this));
  }

  private toggleExpanded() {
    this.expanded = !this.expanded;
    this.updateContent();
  }

  disconnectedCallback() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  private render() {
    this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          top: .5rem;
          right: .5rem;
          background-color: rgba(0, 0, 0, 0.7);
          color: #00ff00;
          font-family: monospace;
          font-size: 12px;
          padding: 10px;
          border-radius: 5px;
          z-index: 9999;
          max-width: 400px;
          max-height: 80vh;
          overflow-y: auto;
          user-select: text;
          cursor: pointer;
          transition: opacity 0.3s;
        }
        :host(:hover) {
          opacity: 1;
        }
        .title {
          font-weight: bold;
          font-size: 14px;
          margin-bottom: 8px;
          text-align: center;
          color: #ffffff;
        }
        .section {
          border-bottom: 1px solid #333;
        }
        .loading { color: orange; }
        .loaded { color: lime; }
        .error { color: red; }
        .info { color: cyan; }
        .target, .entity, .asset {
          margin-left: 10px;
          padding: 2px 0;
        }
        .entity { margin-left: 20px; }
        .asset { margin-left: 30px; }
        .hidden { display: none; }
        .toggle { cursor: pointer; }
      </style>
      <div id="content">Loading...</div>
    `;
  }

  private updateContent() {
    if (!this.gameStore) return;
    
    const contentEl = this.shadow.getElementById("content");
    if (!contentEl) return;

    const { currentChapter, scene } = this.gameStore.state;
    
    let html = "";
    
    // Scene status
    html += `<div class="section">
      <div>Scene: ${scene ? '<span class="loaded">Attached</span>' : '<span class="error">Not Attached</span>'}</div>
    </div>`;

    // Current chapter
    if (currentChapter) {
      html += this.renderChapterInfo(currentChapter);
    } else {
      html += `<div class="section">No chapter loaded</div>`;
    }

    if (!this.expanded) {
      // When collapsed, only show summary
      const summary = currentChapter ? this.generateChapterSummary(currentChapter) : "No chapter loaded";
      html = `<div class="section">${summary}</div>`;
    }

    contentEl.innerHTML = html;
  }

  private generateChapterSummary(chapter: ChapterResource): string {
    const targets = chapter.targets || [];
    const loadedTargets = targets.filter(t => t.status === LoadingState.LOADED).length;
    
    // Count total entities and loaded entities
    let totalEntities = 0;
    let loadedEntities = 0;
    let totalAssets = 0;
    let loadedAssets = 0;
    
    targets.forEach(target => {
      if (target.entity) {
        totalEntities++;
        if (target.entity.status === LoadingState.LOADED) loadedEntities++;
        
        if (target.entity.assets) {
          totalAssets += target.entity.assets.length;
          loadedAssets += target.entity.assets.filter(a => a.status === LoadingState.LOADED).length;
        }
      }
    });
    
    return `
      <div>Chapter: ${chapter.id}</div>
      <div>Status: ${this.getStatusLabel(chapter)}</div>
      <div>Targets: ${loadedTargets}/${targets.length} loaded</div>
      <div>Entities: ${loadedEntities}/${totalEntities} loaded</div>
      <div>Assets: ${loadedAssets}/${totalAssets} loaded</div>
    `;
  }

  private renderChapterInfo(chapter: ChapterResource): string {
    let html = `
      <div class="section">
        <div>Chapter: ${chapter.id || 'unknown'}</div>
        <div>Status: ${this.getStatusLabel(chapter)}</div>
      </div>
    `;
    
    // Targets
    if (chapter.targets && chapter.targets.length > 0) {
      html += `<div class="section">`;
      html += `<div>Targets (${chapter.targets.length}):</div>`;
      
      chapter.targets.forEach((target, i) => {
        html += this.renderTargetInfo(target, i);
      });
      
      html += `</div>`;
    }
    
    return html;
  }

  private renderTargetInfo(target: Target, index: number): string {
    let html = `
      <div class="target">
        <div>Target #${index}: ${this.getStatusLabel(target)}</div>
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
              Asset #${i}: (${asset.type || 'unknown'})
              ${this.getStatusLabel(asset)}
              ${asset.error ? `<div class="error">Error: ${asset.error.msg}</div>` : ''}
              <div class="asset-meta">ID: ${asset.id || 'unnamed'}</div>
              <div class="info">Source: ${this.truncateFilePath(asset.src)}</div>
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
          return `<span class="error">Error: ${resource.error?.code || 'unknown'}</span>`;
        default:
          return '<span class="info">Unknown</span>';
      }
    }
    
    // Fallback to legacy loading state properties
    if (resource.isLoading) {
      return '<span class="loading">Loading...</span>';
    } else if (resource.error) {
      return `<span class="error">Error: ${resource.error.code || 'unknown'}</span>`;
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
    if (!path) return '';
    const parts = path.split('/');
    if (parts.length <= 1) return path;
    
    // Get the filename (last part)
    const filename = parts[parts.length - 1];
    return `.../${filename}`;
  }
}

customElements.define('debug-overlay', DebugOverlay);
