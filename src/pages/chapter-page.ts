import { Page } from "./page";
import { Chapter } from "../store/types";
import { getParam, getParams } from "../utils/route-params";
import "./../components/text-button"

export class ChapterPage extends Page {
  private chapter: Chapter | null = null;
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
    console.log("[ChapterPage] Constructor called",this.game);
    this.handleStateChange = this.handleStateChange.bind(this);
    
    // The game property is already initialized in the Page base class constructor
    // We can just verify it's available
    if (!this.game) {
      console.warn("ChapterPage: GameStore not available from Page constructor");
    }
  }

  static get observedAttributes() {
    return ["active", "route-params"];
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
    if (!this.game) {
      console.error("Cannot load chapter: GameStore not available");
      return;
    }
    
    console.log("[ChapterPage] Loading chapter, chapterId:", this.chapterId);
    console.log("[ChapterPage] Current chapter in state:", this.game.state.currentChapter);
    
    if (this.chapterId) {
      // First check if we already have the chapter in state
      if (this.game.state.currentChapter && this.game.state.currentChapter.id === this.chapterId) {
        console.log(`[ChapterPage] Using current chapter from state, id: ${this.chapterId}`);
        this.chapter = this.game.state.currentChapter;
        this.updateView();
      } else {
        // Try to get from cache first
        const cachedChapter = this.game.getCachedChapter(this.chapterId);
        if (cachedChapter) {
          console.log(`[ChapterPage] Using cached chapter, id: ${this.chapterId}`);
          this.chapter = cachedChapter;
          this.updateView();
        } else {
          console.log(`[ChapterPage] Switching to chapter, id: ${this.chapterId}`);
          // Switch to the requested chapter
          this.game.switchChapter(this.chapterId);
          // The state will update and handleStateChange will be called
        }
      }
    } else if (this.game.state.currentChapter) {
      console.log(`[ChapterPage] No chapter ID provided, using current chapter: ${this.game.state.currentChapter.id}`);
      // Use the existing current chapter if no specific ID is provided
      this.chapter = this.game.state.currentChapter;
      this.updateView();
    } else {
      console.warn("[ChapterPage] No chapter ID provided and no current chapter in state");
      console.log("[ChapterPage] Available chapters:", this.game.getChaptersData());
    }
  }

  connectedCallback() {
    super.connectedCallback();
    console.log("[ChapterPage] Connected, checking GameStore...");
    
    // Ensure game store is available
    if (!this.game) {
      console.error("[ChapterPage] Game store not available after super.connectedCallback()");
      return;
    }
    console.log("[ChapterPage] GameStore available");

    console.log("[ChapterPage] Subscribing to state changes");
    this.game.subscribe(this.handleStateChange);
    
    console.log("[ChapterPage] Processing route params");
    // Check for route params
    this.processRouteParams();
    
    // If we still don't have a chapter ID, check if there's one in the state
    if (!this.chapterId && this.game.state.currentChapter) {
      console.log(`[ChapterPage] No chapterId from route, using current: ${this.game.state.currentChapter.id}`);
      this.chapterId = this.game.state.currentChapter.id;
    }
    
    console.log("[ChapterPage] Loading chapter");
    // Load chapter either from provided ID or from state
    this.loadCurrentChapter();
    
    console.log("[ChapterPage] Setting up event listeners");
    this.setupListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.game?.unsubscribe(this.handleStateChange);
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'route-params' && oldValue !== newValue) {
      this.processRouteParams();
    }
  }
  
  private processRouteParams() {
    this.chapterId = getParam<string>(this, 'chapterId');;
    
    if (this.chapterId) {
      this.loadCurrentChapter();
    } else {
        console.warn("[ChapterPage] No chapterId found in route params");
    }
  }

  private handleStateChange(state: { currentChapter: Chapter | null }) {
    console.log("[ChapterPage] State changed, current chapter:", state.currentChapter);
    
    if (!this.game) {
      console.error("[ChapterPage] GameStore not available in handleStateChange");
      return;
    }
    
    if (state.currentChapter) {
      // Update our chapterId if a new chapter was loaded
      this.chapterId = state.currentChapter.id;
      this.chapter = state.currentChapter;
      console.log(`[ChapterPage] Chapter updated from state change: ${state.currentChapter.id}`);
      this.updateView();
    } else {
      console.warn("[ChapterPage] State changed but no current chapter is set");
    }
  }

  private updateView() {
    console.log("[ChapterPage] Updating view");
    
    if (!this.shadowRoot || !this.game) {
      console.error("[ChapterPage] Cannot update view: Missing shadowRoot or GameStore");
      return;
    }

    const content = this.shadowRoot.querySelector(".chapter-content");
    if (!content) {
      console.error("[ChapterPage] Content element not found");
      return;
    }

    if (!this.chapter) {
      console.warn("[ChapterPage] No chapter available to display");
      content.innerHTML = "<p>No chapter selected</p>";
      return;
    }
    
    console.log(`[ChapterPage] Rendering chapter: ${this.chapter.id} - ${this.chapter.title}`);

    const completion = this.game.getChapterCompletionPercentage(
      this.chapter.id
    );
    const seenTargets = this.game.getSeenTargetsForChapter(this.chapter.id);
    
    console.log(`[ChapterPage] Chapter completion: ${completion}%`);
    console.log(`[ChapterPage] Seen targets: ${seenTargets.length}/${this.chapter.targets.length}`);

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
        ${this.chapter.targets
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

    // We've removed the target click handlers as requested
    // The page is now purely for displaying chapter content
  }

  // We've removed the onTargetClick handler as requested
  // This page is now purely for displaying chapter content

  private setupListeners() {
    if (!this.game || !this.shadowRoot) return;
    
    const backButton = this.shadowRoot.querySelector(".back-button");
    backButton?.addEventListener("click", () => {
      this.game?.navigate('/chapters');
    });
  }
}

customElements.define("chapter-page", ChapterPage);