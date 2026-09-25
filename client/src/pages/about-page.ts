import { ConsultationPage } from "./consultation-page";
import { getBook } from "@/utils/game-config";
import { escapeHtml } from "@/components/consultation/entries-model";

/**
 * About = Info (design p.32–34), opened with "i" in consultation mode; "Entries" (top chrome) goes
 * back to the list. Info text + colophon. Placeholder texts – the final texts belong in the content
 * (`book.yaml`) once they arrive (PLAN Phase 4).
 */
export class AboutPage extends ConsultationPage {
  get styles(): string {
    return /* css */ `
      .section-title:first-child { margin-top: 0; }
      .logo-link {
        display: inline-block;
        margin: .5rem 0 1rem;
        padding: .5rem .75rem;
        border-radius: .5rem;
        background: var(--consultation-text);
      }
      .logo { display: block; height: 3rem; }
      .buttons { margin: 1.5rem 0; }
      .platforms p { margin: 0; }
    `;
  }

  get template(): string {
    const book = getBook();
    const title = escapeHtml(book.title);
    const author = escapeHtml(book.author);
    return /* html */ `
      <div class="content">
        <h2 class="section-title">Info</h2>
        <p>${title} is a publication by ${author}. Scan the pages of the book to unlock entries –
        glossary terms, videos, texts and links – and read them here in consultation mode.</p>

        <h2 class="section-title">Colophon</h2>
        <p>Author: ${author}<br>Published by buildingfictions &copy; 2025</p>
        <a class="logo-link" href="https://buildingfictions.com" target="_blank" rel="noopener noreferrer">
          <img src="/assets/bf.svg" class="logo" alt="buildingfictions" />
        </a>
        <p>App by Tilman Porschuetz</p>
        <div class="buttons">
          <button type="button" class="pill" id="tutorial-btn">Tutorial</button>
        </div>
        <div class="platforms">
          <p>Requires a WebXR compatible browser and a copy of the book.</p>
          <p>Android: Chrome</p>
          <p>Desktop: Chrome, Firefox, Safari</p>
          <p>iOS: Safari, Chrome</p>
        </div>
      </div>
    `;
  }

  setupEventListeners() {
    this.shadowRoot?.querySelector("#tutorial-btn")?.addEventListener("click", this.handleTutorial);
  }

  cleanupEventListeners() {
    this.shadowRoot?.querySelector("#tutorial-btn")?.removeEventListener("click", this.handleTutorial);
  }

  private handleTutorial = () => {
    this.game.router.navigate("/tutorial");
  };

  protected update(): void {
    // Static page
  }
}

customElements.define("about-page", AboutPage);
