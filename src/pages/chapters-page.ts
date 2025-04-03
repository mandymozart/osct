import { Page } from "./page";
import { ChapterData, Pages } from "../store/types";
import { assert } from "../utils/assert";
import "./../components/text-button";

export class ChaptersPage extends Page {
  private chapters: ReadonlyArray<ChapterData> = [];

  protected get styles(): string {
    return /* css */ `
    :host {
        background: transparent;
        border-radius: 0;
        pointer-events: none;
    }
      .content {
        overflow-y: auto;
        height: calc(100vh - var(--offset-top, 4rem));
        margin-top: 2rem;
      }
      .chapters-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
      }
      .chapter-list {
        display: flex;
        width: 20rem;
        gap: 1rem;
        flex-direction: column;
      }
      .chapter-card {
        border: 1px solid var(--color-primary);
        border-radius: 2rem;
        background: var(--color-background);
        padding: 0 0rem 0 5rem;
        display: flex;
        align-items: center;
        gap: 1rem;
        justify-content: flex-start;
        cursor: pointer;
        transform: translateX(-8rem);
        transition: all 0.3s ease;
        pointer-events: auto;
      }
      .chapter-card .chapter-icon {
        font-size: 2rem;
        width: 2rem;
        margin-right: 1rem;
        display:block;
        color: var(--color-primary);
      
    }
      .chapter-card:hover {
        transform: translateX(-5rem);
        box-shadow: 0 0.25rem 0.5rem rgba(0,0,0,0.1);
      }
      .chapter-card.active {
        transform: translateX(-5rem);
      }
      .chapter-meta {
          color: var(--primary-400);
          font-size: 0.75rem;
        }
        .chapter-card h3 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 400;
        } 
        .page-range {
        
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
    `;
  }

  protected get template(): string {
    return /* html */ `
      <div class="content">
        <div class="chapter-list"></div>
      </div>
    `;
  }

  constructor() {
    super();
    console.log("[ChaptersPage] Constructor called", this.game);
    this.handleClick = this.handleClick.bind(this);
    this.handleStateChange = this.handleStateChange.bind(this);

    if (!this.game) {
      console.warn(
        "ChaptersPage: GameStore not available from Page constructor"
      );
    }
  }

  static get observedAttributes() {
    return ["active"];
  }

  connectedCallback() {
    super.connectedCallback();
    console.log("[ChaptersPage] Connected, checking GameStore...");

    // Ensure game store is available
    if (!this.game) {
      console.error(
        "[ChaptersPage] Game store not available after super.connectedCallback()"
      );
      return;
    }
    console.log("[ChaptersPage] GameStore available");

    console.log("[ChaptersPage] Subscribing to state changes");
    this.game.subscribe(this.handleStateChange);

    this.chapters = this.game.getChaptersData();
    console.log("[ChaptersPage] Chapters:", this.chapters);

    this.updateView();
    this.setupListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.game?.unsubscribe(this.handleStateChange);
  }

  private handleStateChange(state: any) {
    console.log("[ChaptersPage] State changed");

    if (!this.game) {
      console.error(
        "[ChaptersPage] GameStore not available in handleStateChange"
      );
      return;
    }

    // Refresh chapters data in case it changed
    this.chapters = this.game.getChaptersData();
    this.updateView();
  }

  private updateView() {
    console.log("[ChaptersPage] Updating view");

    if (!this.shadowRoot || !this.game) {
      console.error(
        "[ChaptersPage] Cannot update view: Missing shadowRoot or GameStore"
      );
      return;
    }

    const list = this.shadowRoot.querySelector(".chapter-list");
    if (!list) {
      console.error("[ChaptersPage] Chapter list element not found");
      return;
    }

    const currentChapter = this.game.state.currentChapter;

    list.innerHTML = this.chapters
      .map((chapter) => {
        const completionPercentage =
          this.game?.getChapterCompletionPercentage(chapter.id) || 0;
        const isActive = currentChapter?.id === chapter.id;

        return /* html */ `
      <div class="chapter-card ${isActive ? "active" : ""}" 
           data-chapter-id="${chapter.id}">
           <div class="chapter-icon">📑</div>
           <div class="chapter-info">
        <h3>${chapter.title}</h3>
        <div class="chapter-meta">
          <div class="page-range">Pages ${chapter.firstPage} - ${
          chapter.lastPage
        } <span>(${completionPercentage}%)</span></div>
          <div class="progress-bar">
            <div style="width: ${completionPercentage}%"></div>
          </div>
          </div>
        </div>
      </div>
    `;
      })
      .join("");
  }

  private setupListeners() {
    const list = this.shadowRoot?.querySelector(".chapter-list");
    list?.addEventListener("click", this.handleClick);
  }

  private handleClick(event: Event) {
    const card = (event.target as Element).closest(".chapter-card");
    if (!card) return;

    const chapterId = card.getAttribute("data-chapter-id");
    if (chapterId) {
      assert(this.game, "Game store not initialized");
      console.log(`[ChaptersPage] Navigating to chapter: ${chapterId}`);

      // Switch to the selected chapter
      this.game.switchChapter(chapterId);

      // Navigate to the chapter page with the chapter ID as a parameter
      //   this.game.navigate(`/chapter/${chapterId}`);
    }
  }
}

customElements.define("chapters-page", ChaptersPage);
