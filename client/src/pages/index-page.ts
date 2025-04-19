import { GameStoreService } from '@/services/GameStoreService';
import { IGame } from '@/types';
import { assert } from '@/utils';
import { Page } from './page';

// Import to ensure the components are registered
// TODO: this is not ideal. use event system rather than the instance
// not sure why the import is needed
import '@/components/index';
import { ChapterList } from '@/components/index/chapter-list';

export interface IIndexPage extends HTMLElement {
  scrollToCurrentChapter(): void;
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
        bottom: 4rem;
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
        <chapter-list id="chapter-list"></chapter-list>
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

  private handleStateChange() {
    // Use the static instance to access methods directly
    if (ChapterList.instance) {
      ChapterList.instance.updateChapters();
    }
  }

  /**
   * Public method to scroll to the current chapter
   */
  public scrollToCurrentChapter() {
    // Use the static instance to access methods directly
    if (ChapterList.instance) {
      ChapterList.instance.scrollToCurrentChapter();
    }
  }
}

customElements.define('index-page', IndexPage);
