import { ChapterData, ChapterResource } from "@/types";
import { chapters } from "@/game.config.json";

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
    
    this.shadowRoot.innerHTML = /* html */`
      <style>
        :host {
          display: block;
        }
        
        .chapter-header {
          display: grid;
          grid-template-columns: auto 4rem;
          font-weight: 600;
          gap: 1rem;
          line-height: 3rem;
          cursor: pointer;
          border-bottom: .1rem solid var(--color-primary);
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
      </style>
      
      <div class="chapter-header ${this._isCurrent ? 'current' : 'muted'}">
        <span class="chapter-title">📑 ${this._chapterData?.title || 'Untitled'}</span>
        <span class="chapter-pages">${this._chapterData?.firstPage} &mdash; ${this._chapterData?.lastPage}</span>
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
