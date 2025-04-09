import { ChapterData, ChapterResource, LoadingState } from "@/types";
import { chapters } from "@/game.config.json";
import { GameStoreService } from "@/services/GameStoreService";

export interface IChapterItem extends HTMLElement {
  chapter: ChapterResource | null;
  isCurrent: boolean;
  chapterData: ChapterData | null;
}

/**
 * ChapterItem Component
 * 
 * Displays a chapter header in the index page
 */
export class ChapterItem extends HTMLElement implements IChapterItem {
  private _chapter: ChapterResource | null = null;
  private _isCurrent = false;
  private _chapterData: ChapterData | null = null;
  private game = GameStoreService.getInstance().getGame();
  
  static get observedAttributes() {
    return ['is-current'];
  }
  
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.handleClick = this.handleClick.bind(this);
  }
  
  connectedCallback() {
    this.render();
    this.addEventListener('click', this.handleClick);
  }
  
  disconnectedCallback() {
    this.removeEventListener('click', this.handleClick);
  }
  
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'is-current' && oldValue !== newValue) {
      this._isCurrent = newValue === 'true';
      this.render();
    }
  }
  
  private render() {
    if (!this.shadowRoot || !this._chapter) return;
    
    // Get loading status if available
    const loadingStatus = this._chapter.status === LoadingState.LOADING ? '(Loading...)' : '';
    
    // Get completion percentage from history
    const completionPercentage = this.game?.history.getChapterCompletionPercentage(this._chapter.id) ?? 0;
    
    // Get info about seen targets
    const seenTargets = this.game?.history.getSeenTargetsForChapter(this._chapter.id) ?? [];
    const seenCount = seenTargets.length;
    const isComplete = this.game?.history.isChapterComplete(this._chapter.id) ?? false;
    const statusText = isComplete ? 'Complete' : seenCount > 0 ? `${seenCount} targets seen` : 'Not started';
    
    this.shadowRoot.innerHTML = /* html */`
      <style>
        :host {
          display: block;
          border-bottom: .1rem solid var(--color-primary);
        }
        
        .chapter-header {
          display: grid;
          grid-template-columns: auto 4rem;
          font-weight: 600;
          gap: 1rem;
          line-height: 3rem;
          cursor: pointer;
        }
        
        .chapter-pages {
          text-align: right;
        }
        
        .current {
          color: var(--color-primary);
        }
        
        .muted {
          color: var(--primary-400);
          border-color: var(--primary-400);
        }
        
        .chapter-meta {
          color: var(--primary-400);
          font-size: 0.75rem;
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }
        
        .loading-indicator {
          font-style: italic;
          color: var(--primary-300);
          margin-left: 0.5rem;
        }
        
        .progress-bar {
          width: 100%;
          height: 0.25rem;
          background: var(--primary-200);
          border-radius: .25rem;
          margin: 0.25rem 0;
        }
        
        .progress-bar div {
          height: 100%;
          background: var(--color-primary);
          border-radius: 4px;
          transition: width 0.3s ease;
        }
      </style>
      
      <div class="chapter-header ${this._isCurrent ? 'current' : 'muted'}">
        <span class="chapter-title">📑 ${this._chapterData?.title || 'Untitled'} <span class="loading-indicator">${loadingStatus}</span></span>
        <span class="chapter-pages">${this._chapterData?.firstPage} &mdash; ${this._chapterData?.lastPage}</span>
      </div>
      <div class="progress-bar">
        <div style="width: ${completionPercentage}%"></div>
      </div>
      <div class="chapter-meta">
        <div class="completion">Completion: <span>${completionPercentage}%</span></div>
        <div class="status">${statusText}</div>
      </div>
    `;
  }
  
  private handleClick(event: Event) {
    if (!this._chapter) return;
    
    // If not the current chapter, dispatch event to switch
    if (!this._isCurrent) {
      this.dispatchEvent(new CustomEvent('chapter-select', {
        bubbles: true,
        composed: true,
        detail: { chapterId: this._chapter.id }
      }));
    }
  }
  
  // Getters and setters
  get chapter(): ChapterResource | null {
    return this._chapter;
  }
  
  set chapter(value: ChapterResource | null) {
    this._chapter = value;
    this.render();
  }
  
  get isCurrent(): boolean {
    return this._isCurrent;
  }
  
  set isCurrent(value: boolean) {
    this._isCurrent = value;
    this.setAttribute('is-current', String(value));
  }
  
  get chapterData(): ChapterData | null {
    return this._chapterData;
  }
  
  set chapterData(value: ChapterData | null) {
    this._chapterData = value;
    this.render();
  }
}

customElements.define('chapter-item', ChapterItem);
