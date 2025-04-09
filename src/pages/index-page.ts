import { Page } from "./page";
import { assert } from "@/utils";
import { IGame } from "@/types";
import { GameStoreService } from "@/services/GameStoreService";

// Import to ensure the components are registered
// TODO: this is not ideal. use event system rather than the instance
// not sure why the import is needed
import "@/components/index";
import { ChapterList } from "@/components/index/chapter-list";

export interface IIndexPage extends HTMLElement {
  scrollToCurrentChapter(): void;
}

export class IndexPage extends Page implements IIndexPage {
  protected game: IGame | null = null;

  constructor() {
    super();
    this.handleStateChange = this.handleStateChange.bind(this);
  }

  protected get styles(): string {
    return /* css */ `
      :host {
        display: block;
        height: 100%;
      }
      
      .content {
        padding: 2rem;
        overflow-y: auto;
        height: calc(100vh - var(--offset-top)-2rem);

        margin: 0 0 10rem 0;
      }
      
      h1 {
        margin: 0 0 2rem 0;
        font-weight: 400;
        font-size: 1.5rem;
        color: var(--primary-500);
      }
    `;
  }

  protected get template(): string {
    return /* html */ `
      <div class="content">
        <h1>Index</h1>
        <chapter-list id="chapter-list"></chapter-list>
      </div>
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    assert(this.shadowRoot, 'Shadow root not initialized');
    
    // Get game instance
    this.game = GameStoreService.getInstance().getGame();
    assert(this.game, 'Game not initialized');
    
    // Subscribe to state changes
    this.game.subscribe(this.handleStateChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.game?.unsubscribe(this.handleStateChange);
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

customElements.define("index-page", IndexPage);
