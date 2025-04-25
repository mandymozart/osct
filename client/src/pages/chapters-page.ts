import { getChapter, getChapters } from "@/utils/config";
import { ChapterData, GameState, LoadingState } from "../types";
import { assert } from "../utils/assert";
import { PageMinimal } from "./page-minimal";

export class ChaptersPage extends PageMinimal {
   get styles(): string {
    return /* css */ `
    :host {
        background: transparent;
        border-radius: 0;
        pointer-events: none;
        margin-top: var(--offset-top, 4rem);
    }
    ::slotted(*) {
        pointer-events: none;
    }
      .content {
        overflow-y: auto;
        pointer-events: none;
        height: calc(100vh - var(--offset-top, 4rem) - 2rem);
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

   get template(): string {
    return /* html */ `
      <div class="content">
        <div class="chapter-list"></div>
      </div>
    `;
  }

  constructor() {
    super();
    this.handleClick = this.handleClick.bind(this);
    this.handleStateChange = this.handleStateChange.bind(this);
  }

  static get observedAttributes() {
    return ["active"];
  }

  connectedCallback() {
    super.connectedCallback();

    this.game?.subscribe(this.handleStateChange);
    this.updateView();
    this.setupListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.game?.unsubscribe(this.handleStateChange);
  }

  private handleStateChange(state: GameState) {
    this.updateView();
  }

  private updateView() {
    assert(this.game, "GameStore not available in updateView");
    assert(this.shadowRoot, "ShadowRoot not available in updateView");

    const list = this.shadowRoot!.querySelector(".chapter-list");
    assert(list, "Chapter list element not found");

    const currentChapter = this.game.state.currentChapter;

    list.innerHTML = getChapters()
      .map((chapterData: ChapterData) => {
        const completionPercentage =
          this.game!.history.getChapterCompletionPercentage(chapterData.id) ??
          0;
        const isActive = currentChapter === chapterData.id;


        return /* html */ `
      <div class="chapter-card ${isActive ? "active" : ""}" 
           data-chapter-id="${chapterData.id}">
           <div class="chapter-icon">📑</div>
           <div class="chapter-info">
        <h3>${chapterData.title}</h3>
        <div class="chapter-meta">
          <div class="page-range">Pages ${chapterData.firstPage} - ${
          chapterData.lastPage
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
    assert(this.shadowRoot, "ShadowRoot not available in setupListeners");
    const list = this.shadowRoot!.querySelector(".chapter-list");
    assert(list, "Chapter list element not found");
    list!.addEventListener("click", this.handleClick);
  }

  private handleClick(event: Event) {
    const target = event.target as HTMLElement;
    const chapterCard = target.closest(".chapter-card") as HTMLElement;

    if (chapterCard) {
      const chapterId = chapterCard.dataset.chapterId;
      if (chapterId) {
        this.game.chapters.switchChapter(chapterId);
        this.game.router.navigate("/chapter", {
          key: "chapterId",
          value: chapterId,
        });
      }
    }
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === "active" && newValue !== oldValue && newValue === "true") {
      this.updateView();
    }
  }
}

customElements.define("chapters-page", ChaptersPage);
