import { GameStoreService } from '@/services/GameStoreService';
import { IGame, Pages } from '@/types';
import { getEntry } from '@/utils/game-config';
import { assert } from '@/utils';
import { Page } from './page';

// The barrel also registers <spread-list>, <spread-item> and <target-item>
import { SpreadList } from '@/components/dev-index';

export interface IIndexPage extends HTMLElement {
  scrollToCurrentSpread(): void;
}

export class IndexPage extends Page implements IIndexPage {
  protected game: Readonly<IGame>;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.handleStateChange = this.handleStateChange.bind(this);
  }

  get styles(): string {
    return /* css */ `
      :host {
        display: block;
        pointer-events: all;
        bottom: 4rem;
      }
      
      .content {
        padding: 0;
        position: absolute;
        top: 6rem;
        overflow-y: auto;
        bottom: 0;
        width: 100%;
      }
      
      .header {
        display: flex;
        height: 6rem;
        background: var(--color-background);
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
      }
      
      h1 {
        padding: 0 1rem;
        font-weight: 400;
        font-size: 1.5rem;
        color: var(--primary-500);
      }
    `;
  }

  get template(): string {
    return /* html */ `
    <div class="header">
            <h1>Index</h1>
        <close-button></close-button>
        </div>
      <div class="content">
        <spread-list id="spread-list"></spread-list>
      </div>
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    assert(this.shadowRoot, 'Shadow root not initialized');
    this.game.subscribe(this.handleStateChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.game.unsubscribe(this.handleStateChange);
  }

  private handleClose = () => this.game.router.close();

  setupEventListeners(): void {
    const closeButton = this.shadowRoot?.querySelector('close-button');
    if (closeButton) {
      closeButton.addEventListener('close', this.handleClose);
    }
  }

  cleanupEventListeners(): void {
    const closeButton = this.shadowRoot?.querySelector('close-button');
    if (closeButton) {
      closeButton.removeEventListener('close', this.handleClose);
    }
  }

  /** Entry opened through the route param, so a later state change doesn't reopen it */
  private openedEntryId: string | null = null;

  private handleStateChange() {
    // Use the static instance to access methods directly
    if (SpreadList.instance) {
      SpreadList.instance.updateSpreads();
    }
    this.openRouteEntry();
  }

  /** `/index` with `entryId`: open that entry in the list (Phase 4: the /entry view) */
  private openRouteEntry() {
    const route = this.game.state.currentRoute;
    const entryId = route?.page === Pages.INDEX && route.param?.key === 'entryId' ? String(route.param.value) : null;
    if (entryId === this.openedEntryId) return;
    this.openedEntryId = entryId;
    const targetId = entryId ? getEntry(entryId)?.target?.id : undefined;
    if (targetId) SpreadList.instance?.openTarget(targetId);
  }

  /**
   * Public method to scroll to the current spread
   */
  public scrollToCurrentSpread() {
    // Use the static instance to access methods directly
    if (SpreadList.instance) {
      SpreadList.instance.scrollToCurrentSpread();
    }
  }
}

customElements.define('index-page', IndexPage);
