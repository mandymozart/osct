import { chapters, initialChapterId } from "@/game.config.json";
import { ChapterData, GameState, LoadingState } from "../types";
import { assert } from "../utils/assert";
import { PageMinimal } from "./page-minimal";
import { getChapter } from "@/utils/config";

export class ChapterPage extends PageMinimal {
  static get observedAttributes() {
    return ["chapter-id"];
  }

  private chapter: ChapterData | undefined = undefined;
  private chapterId: string | null = null;
  
// TODO: pointer events propagation when overlayed. but this depends on how we want to handle the overlay.

   get styles(): string {
    return /* css */ `
      :host {
        background: none;
        border-radius: 0;
        margin-top: var(--offset-top, 4rem);
      }
      .content {
        overflow-y: auto;
        height: calc(100vh - var(--offset-top, 4rem) - 2rem);
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
        width: 15rem;
      }
      .chapter-card .chapter-icon {
        font-size: 2rem;
        width: 2rem;
        margin-right: 1rem;
        display: block;
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

   get template(): string {
    return /* html */ `
      <div class="content">
        <div class="chapter-card"></div>
      </div>
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    this.chapterId = this.getAttribute("chapterId");
    this.game?.subscribe(this.handleStateChange.bind(this));
    this.setupEventListeners();
    this.updateView();
}

 setupEventListeners() {
    this.shadowRoot?.querySelector('.chapter-card')?.addEventListener('click', () => {
        if (this.game) {
            this.game.router.navigate('/chapters');
        }
    });
}

disconnectedCallback() {
    super.disconnectedCallback();
    this.game?.unsubscribe(this.handleStateChange);
    // Clean up event listeners
    this.shadowRoot?.querySelector('.chapter-card')?.removeEventListener('click', () => {});
}

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === "chapter-id" && newValue !== oldValue) {
      this.chapterId = newValue;
      this.updateView();
    }
  }

  private handleStateChange(state: GameState) {
    this.updateView();
  }

  private updateView() {
    assert(this.game, "GameStore not available in updateView");
    assert(this.shadowRoot, "ShadowRoot not available in updateView");

    const cardContainer = this.shadowRoot.querySelector(".chapter-card");
    assert(cardContainer, "Chapter card element not found");

    console.log("[ChapterPage] chapterId:", this.chapterId)
    if (!this.chapterId) {
      this.chapterId = initialChapterId;
      return;
    }

    this.chapter = getChapter(this.chapterId);
    if (!this.chapter) {
      console.warn(`Chapter not found: ${this.chapterId}`);
      cardContainer.innerHTML = '<div class="error">Chapter not found</div>';
      return;
    }
    const completionPercentage = this.game.history.getChapterCompletionPercentage(this.chapterId) ?? 0;

    cardContainer.innerHTML = /* html */ `
      <div class="chapter-icon">📑</div>
      <div class="chapter-info">
        <h3>${this.chapter.title}</h3>
        <div class="chapter-meta">
          <div class="page-range">Pages ${this.chapter.firstPage} - ${this.chapter.lastPage} <span>(${completionPercentage}%)</span></div>
          <div class="progress-bar">
            <div style="width: ${completionPercentage}%"></div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("chapter-page", ChapterPage);
