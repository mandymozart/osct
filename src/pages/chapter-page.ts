import { Page } from "./page";
import { getParam } from "../utils/route-params";
import { ChapterResource, GameState } from "../types";
import { assert } from "../utils/assert";

export class ChapterPage extends Page {
  private chapter: ChapterResource | null = null;
  private chapterId?: string;

  protected get styles(): string {
    return /* css */ `
      .content {
        padding: 0 2rem;
        overflow-y: auto;
        margin-top: 2rem;
      }
      .chapter-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
      }
      .progress-bar {
        width: 100%;
        height: 8px;
        background: var(--color-background);
        border-radius: 4px;
        margin: 1rem 0;
      }
      .progress-bar div {
        height: 100%;
        background: var(--color-primary);
        border-radius: 4px;
        transition: width 0.3s ease;
      }
      .target-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
      }
      .target-item {
        padding: 1rem;
        border: 1px solid var(--color-primary);
        border-radius: 8px;
        opacity: 0.7;
      }
      .target-item.seen {
        opacity: 1;
        background: var(--color-accent);
      }
    `;
  }

  protected get template(): string {
    return /* html */ `
      <div class="content">
        <div class="chapter-header">
          <h2>Loading chapter...</h2>
          <button is="text-button" class="back-button">Back to Chapters</button>
        </div>
        <div class="chapter-content"></div>
      </div>
    `;
  }

  constructor() {
    super();
    this.handleStateChange = this.handleStateChange.bind(this);
  }

  /**
   * Set the chapter ID to load and trigger loading
   * @param id The chapter ID to load
   */
  public loadChapter(id: string): void {
    this.chapterId = id;
    this.loadCurrentChapter();
  }

  /**
   * Load the chapter from the game store
   */
  private loadCurrentChapter(): void {
    assert(this.game, "GameStore not available in loadCurrentChapter");

    if (this.chapterId) {
      // First check if we already have the chapter in state
      if (
        this.game.state.currentChapter &&
        this.game.state.currentChapter.id === this.chapterId
      ) {
        this.chapter = this.game.state.currentChapter;
        this.updateView();
      } else {
        // Try to get from cache first
        const cachedChapter = this.game.chapters.getCachedChapter(this.chapterId);
        if (cachedChapter) {
          this.chapter = cachedChapter;
          this.updateView();
        } else {
          // Switch to the requested chapter
          this.game.chapters.switchChapter(this.chapterId);
          // The state will update and handleStateChange will be called
        }
      }
    } else if (this.game.state.currentChapter) {
      // Use the existing current chapter if no specific ID is provided
      this.chapter = this.game.state.currentChapter;
      this.updateView();
    } else {
      // No chapter available
      // this.game.notifyError({
      //   msg: "No chapter available to display",
      //   code: "no-chapter-available"
      // });
    }
  }

  connectedCallback() {
    super.connectedCallback();
    assert(this.game, "GameStore not available in connectedCallback");

    this.game.subscribe(this.handleStateChange);

    // Check for route params
    this.processRouteParams();

    // If we still don't have a chapter ID, check if there's one in the state
    if (!this.chapterId && this.game.state.currentChapter) {
      this.chapterId = this.game.state.currentChapter.id;
    }

    // Load chapter either from provided ID or from state
    this.loadCurrentChapter();
    this.setupListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    assert(this.game, "GameStore not available in disconnectedCallback");
    this.game.unsubscribe(this.handleStateChange);
  }

  protected handleRouteParamsChange(paramsJson: string): void {
    this.processRouteParams();

    if (this.chapterId) {
      this.loadCurrentChapter();
    }
  }

  private processRouteParams() {
    this.chapterId = getParam<string>(this, "chapterId");

    if (this.chapterId) {
      this.loadCurrentChapter();
    }
  }

  private handleStateChange(state: GameState) {
    assert(this.game, "GameStore not available in handleStateChange");

    if (state.currentChapter) {
      // Update our chapterId if a new chapter was loaded
      this.chapterId = state.currentChapter.id;
      this.chapter = state.currentChapter;
      this.updateView();
    }
  }

  private updateView() {
    console.log('ChapterPage.updateView()', this.chapter);
    assert(this.shadowRoot, "ShadowRoot not available in updateView");
    assert(this.game, "GameStore not available in updateView");

    const content = this.shadowRoot.querySelector(".chapter-content");
    assert(content, "Content element not found");

    if (!this.chapter) {
      content.innerHTML = "<p>No chapter selected</p>";
      return;
    }

    const completion = this.game.history.getChapterCompletionPercentage(
      this.chapter.id
    );
    const seenTargets = this.game.history.getSeenTargetsForChapter(this.chapter.id);

    // Update chapter header
    const headerTitle = this.shadowRoot.querySelector(".chapter-header h2");
    if (headerTitle) {
      headerTitle.textContent = this.chapter.title;
    }

    content.innerHTML = /* html */ `      
      <div class="progress-bar">
        <div style="width: ${completion}%"></div>
      </div>
      <p>Progress: ${completion}% complete</p>
      
      <div class="target-list">
        ${this.chapter?.targets
          .map(
            (target, index) => /* html */ `
          <div 
            class="target-item ${seenTargets.includes(index) ? "seen" : ""}"
          >
            <h3>${target.title || `Target ${index + 1}`}</h3>
            <span class="target-item-bookId">${target.bookId}</span>
            ${target.description ? `<p>${target.description}</p>` : ""}
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  private setupListeners() {
    assert(this.shadowRoot, "ShadowRoot not available in setupListeners");
    assert(this.game, "GameStore not available in setupListeners");
    assert(this.game.router, "Router not available in setupListeners");

    const backButton = this.shadowRoot.querySelector(".back-button");
    assert(backButton, "Back button not found");
    
    backButton.addEventListener("click", () => {
      this.game.router.navigate("/chapters");
    });
  }
}

customElements.define("chapter-page", ChapterPage);
