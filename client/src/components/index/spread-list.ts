import { GameStoreService } from '@/services/GameStoreService';
import { SpreadData, IGame, TargetData } from '@/types';
import { assert } from '@/utils';
import './spread-item';
import './target-item';
import { getSpread, getSpreads } from '@/utils/content';

export interface ISpreadList extends HTMLElement {
  updateSpreads(): void;
  scrollToCurrentSpread(): void;
}

/**
 * SpreadList Component
 *
 * Container for all spreads and their targets in the index page
 */
export class SpreadList extends HTMLElement implements ISpreadList {
  private game: Readonly<IGame>;
  private spreads: SpreadData[] = [];
  private expandedTargetId: string | null = null;
  private unsubscribe: (() => void) | null = null;

  // Static property for direct access
  static instance: SpreadList | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: 'open' });
    this.handleStateChange = this.handleStateChange.bind(this);
    this.handleSpreadSelect = this.handleSpreadSelect.bind(this);
    this.handleTargetToggle = this.handleTargetToggle.bind(this);
    this.handleTargetSelect = this.handleTargetSelect.bind(this);

    // Store instance reference for direct access
    SpreadList.instance = this;
  }

  connectedCallback() {
    assert(this.game, 'Game store not initialized');
    this.render();
    this.unsubscribe = this.game.subscribe(this.handleStateChange);
    this.updateSpreads();
    this.setupEventListeners();
  }

  disconnectedCallback() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.removeEventListeners();
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          display: block;
          margin-bottom: 2rem;
        }
        
        .no-spreads {
          text-align: center;
          color: var(--color-primary-500);
        }
      </style>
      
      <div id="container">
        <div class="no-spreads">Loading spreads...</div>
      </div>
    `;
  }

  private setupEventListeners() {
    this.addEventListener(
      'spread-select',
      this.handleSpreadSelect as EventListener,
    );
    this.addEventListener(
      'target-toggle',
      this.handleTargetToggle as EventListener,
    );
    this.addEventListener(
      'target-select',
      this.handleTargetSelect as EventListener,
    );
  }

  private removeEventListeners() {
    this.removeEventListener(
      'spread-select',
      this.handleSpreadSelect as EventListener,
    );
    this.removeEventListener(
      'target-toggle',
      this.handleTargetToggle as EventListener,
    );
    this.removeEventListener(
      'target-select',
      this.handleTargetSelect as EventListener,
    );
  }

  private handleStateChange() {
    this.updateSpreads();
  }

  public updateSpreads() {
    assert(this.game, 'Game store not initialized');

    this.spreads = getSpreads();

    this.spreads.sort((a, b) => {
      const aData = getSpread(a.id);
      const bData = getSpread(b.id);
      if (aData && bData) {
        return aData.order - bData.order;
      }
      return a.id.localeCompare(b.id);
    });

    this.renderSpreads();
  }

  private renderSpreads() {
    if (!this.shadowRoot) return;
    const container = this.shadowRoot.querySelector('#container');
    assert(container, 'Container element not found');

    if (this.spreads.length === 0) {
      container.innerHTML =
        '<div class="no-spreads">No spreads available</div>';
      return;
    }

    // Clear the container
    container.innerHTML = '';

    const currentSpreadId = this.game.state.currentSpread || null;

    // Create and append spread and target elements
    this.spreads.forEach((spread) => {
      const isCurrent = spread.id === currentSpreadId;
      const spreadData = getSpread(spread.id);

      // Create and append spread item
      const spreadItem = document.createElement('spread-item') as any;
      spreadItem.spread = spread;
      spreadItem.isCurrent = isCurrent;
      spreadItem.spreadData = spreadData;
      container.appendChild(spreadItem);

      // Append targets if they exist
      if (spread.targets && spread.targets.length > 0) {
        spread.targets.forEach((target: TargetData) => {
          if(target.hideFromIndex) return;
          // Create and append target item
          const targetItem = document.createElement('target-item') as any;
          targetItem.target = target;
          targetItem.isCurrent = isCurrent; // TODO: Is current makes no sense to inject via attribute
          targetItem.isExpanded = this.expandedTargetId === target.bookId;
          container.appendChild(targetItem);
        });
      } else {
        // No targets message
        const noTargets = document.createElement('div');
        noTargets.classList.add('no-spreads');
        noTargets.textContent = 'No targets in this spread';
        container.appendChild(noTargets);
      }
    });
  }

  private handleSpreadSelect(event: CustomEvent) {
    const { spreadId } = event.detail;
    if (spreadId && this.game) {
      this.activateSpread(spreadId);
    }
  }

  private handleTargetToggle(event: CustomEvent) {
    const { targetId } = event.detail;
    if (targetId) {
      // Toggle expansion
      this.expandedTargetId =
        this.expandedTargetId === targetId ? null : targetId;
      this.renderSpreads();
    }
  }

  private handleTargetSelect(event: CustomEvent) {
    const { targetId } = event.detail;
    if (!targetId) return;

    // Find the spread that contains this target
    for (const spread of this.spreads) {
      const targetExists = spread.targets.some(
        (target: TargetData) => target.bookId === targetId,
      );
      if (targetExists && spread.id !== this.game?.state.currentSpread) {
        this.activateSpread(spread.id);
        break;
      }
    }
  }

  private activateSpread(spreadId: string) {
    if (!this.game) return;
    this.game.spreads.switchSpread(spreadId);
  }

  public scrollToCurrentSpread() {
    if (!this.shadowRoot || !this.game?.state.currentSpread) return;

    // Give the DOM time to update
    setTimeout(() => {
      const currentSpreadId = this.game?.state.currentSpread;
      if (currentSpreadId) {
        const currentSpread = this.shadowRoot?.querySelector(
          `spread-item[is-current="true"]`,
        );
        if (currentSpread) {
          currentSpread.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }, 100);
  }
}

customElements.define('spread-list', SpreadList);
