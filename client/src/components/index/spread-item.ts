import { SpreadData, IGame } from "@/types";
import { GameStoreService } from "@/services/GameStoreService";

export interface ISpreadItem extends HTMLElement {
  spread: SpreadData | null;
  isCurrent: boolean;
  spreadData: SpreadData | null;
}

/**
 * SpreadItem Component
 * 
 * Displays a spread header in the index page
 */
export class SpreadItem extends HTMLElement implements ISpreadItem {
  private _spread: SpreadData | null = null;
  private _isCurrent = false;
  private _spreadData: SpreadData | null = null;
  private game: Readonly<IGame>;
  
  static get observedAttributes() {
    return ['is-current'];
  }
  
  constructor() {
    super();
    this.game = GameStoreService.getInstance();
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
    if (!this.shadowRoot || !this._spread) return;
    
    // Get completion percentage from history
    const completionPercentage = this.game?.history.getSpreadCompletionPercentage(this._spread.id) ?? 0;
    
    // Get info about unlocked targets
    const unlockedCount = this.game?.history.getUnlockedTargets(this._spread.id).length ?? 0;
    const isComplete = this.game?.history.isSpreadComplete(this._spread.id) ?? false;
    const statusText = isComplete ? 'Complete' : unlockedCount > 0 ? `${unlockedCount} targets unlocked` : 'Not started';
    
    this.shadowRoot.innerHTML = /* html */`
      <style>
        :host {
          display: block;
          margin: 0 1rem;
          border-bottom: .1rem solid var(--color-primary);
        }
        
        .spread-header {
          display: grid;
          grid-template-columns: auto 4rem;
          font-weight: 600;
          gap: 1rem;
          line-height: 3rem;
          cursor: pointer;
        }
        
        .spread-pages {
          text-align: right;
        }
        
        .current {
          color: var(--color-primary);
        }
        
        .muted {
          color: var(--primary-400);
          border-color: var(--primary-400);
        }
        
        .spread-meta {
          color: var(--primary-400);
          font-size: 0.75rem;
          display: flex;
          justify-content: space-between;
          margin: 0 0 0.5rem 0;
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
      
      <div class="spread-header ${this._isCurrent ? 'current' : 'muted'}">
        <span class="spread-title">📑 ${this._spreadData?.title || 'Untitled'} 
        ${!this._isCurrent ? '<button is="text-button" size="xs" style="display: inline-block;">Select</button>' : ''}
        </span>
        <span class="spread-pages">${this._spreadData?.firstPage} &mdash; ${this._spreadData?.lastPage}</span>
      </div>
      <div class="progress-bar">
        <div style="width: ${completionPercentage}%"></div>
      </div>
      <div class="spread-meta">
        <div class="completion">Completion: <span>${completionPercentage}%</span></div>
        <div class="status">${statusText}</div>
      </div>
    `;
  }
  
  private handleClick(event: Event) {
    if (!this._spread) return;
    
    // If not the current spread, dispatch event to switch
    if (!this._isCurrent) {
      this.dispatchEvent(new CustomEvent('spread-select', {
        bubbles: true,
        composed: true,
        detail: { spreadId: this._spread.id }
      }));
    }
  }
  
  // Getters and setters
  get spread(): SpreadData | null {
    return this._spread;
  }
  
  set spread(value: SpreadData | null) {
    this._spread = value;
    this.render();
  }
  
  get isCurrent(): boolean {
    return this._isCurrent;
  }
  
  set isCurrent(value: boolean) {
    this._isCurrent = value;
    this.setAttribute('is-current', String(value));
  }
  
  get spreadData(): SpreadData | null {
    return this._spreadData;
  }
  
  set spreadData(value: SpreadData | null) {
    this._spreadData = value;
    this.render();
  }
}

customElements.define('spread-item', SpreadItem);
