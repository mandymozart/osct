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
  protected game: Readonly<IGame>;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
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
        <close-button></close-button>
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

  private handleClose = () => 
      this.game.router.close();
    

  protected setupEventListeners(): void {
    const closeButton = this.shadowRoot?.querySelector("close-button");
    if (closeButton) {
      closeButton.addEventListener("close", this.handleClose);
    }
  }

  protected cleanupEventListeners(): void {
    const closeButton = this.shadowRoot?.querySelector("close-button");
    if (closeButton) {
      closeButton.removeEventListener("close", this.handleClose);
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

customElements.define("index-page", IndexPage);
