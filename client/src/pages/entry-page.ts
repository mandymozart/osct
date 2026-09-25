import { Entry, EntryCategory, Pages } from "@/types";
import { getEntry } from "@/utils/game-config";
import { CATEGORY_LABELS, escapeHtml, linkEmbed, paragraphs } from "@/components/consultation/entries-model";
import { ICONS } from "@/components/consultation/icons";
import { ConsultationPage } from "./consultation-page";

const NOTE_SAVE_MS = 400;

/**
 * Entry view (design p.15, 20, 25, 30–31): meta table (name, access page, category, author for
 * texts), then per category – glossary: text + image; texts: long text; videos: a note to scan the
 * access page + a preview player (to check rendering); links: embedded player/page + "open in a new
 * tab". Opening the entry marks it consulted. Bookmark + note (PLAN Phase 4, placeholder icons).
 */
export class EntryPage extends ConsultationPage {
  /** Entry currently rendered – progress changes (bookmark, note) must not rebuild the note field */
  private renderedId: string | null = null;
  private noteTimer: number | undefined;

  get styles(): string {
    return /* css */ `
      .rule-table { margin-bottom: 1.5rem; }
      .body p + p { text-indent: 2em; margin-top: -1em; }
      img.entry-image, video, iframe {
        display: block;
        width: 100%;
        border: none;
        margin: 1rem 0;
        background: #000;
      }
      img.entry-image { background: none; }
      iframe.video { aspect-ratio: 16 / 9; }
      iframe.page { height: 70vh; background: #fff; }
      .hint { color: var(--color-muted); font-size: var(--text-size-small); }
      .actions { margin-top: 2rem; }
      .action-row { display: flex; flex-wrap: wrap; gap: .75rem; }
      .bookmark, .add-note { gap: .4rem; }
      /* The icons draw with currentColor: flat gold next to the gradient label */
      .bookmark svg, .add-note svg { color: var(--color-accent); }
      [hidden] { display: none !important; }
      label { display: block; margin: 1.25rem 0 .4rem; color: var(--color-muted); }
      textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 5rem;
        padding: .5rem;
        border: var(--rule);
        border-radius: .5rem;
        background: var(--glass-background);
        color: var(--color-on-dark);
        font: inherit;
        letter-spacing: inherit;
        resize: vertical;
      }
      .missing { color: var(--color-muted); }
    `;
  }

  get template(): string {
    return /* html */ `<div class="content"></div>`;
  }

  setupEventListeners(): void {
    this.shadowRoot?.addEventListener("click", this.handleClick);
    this.shadowRoot?.addEventListener("input", this.handleInput);
    this.shadowRoot?.addEventListener("focusout", this.handleBlur);
  }

  cleanupEventListeners(): void {
    this.shadowRoot?.removeEventListener("click", this.handleClick);
    this.shadowRoot?.removeEventListener("input", this.handleInput);
    this.shadowRoot?.removeEventListener("focusout", this.handleBlur);
    this.saveNote();
  }

  protected update(): void {
    const content = this.shadowRoot?.querySelector(".content");
    if (!content) return;
    const id = this.routeParam(Pages.ENTRY);
    if (!id) {
      // Leaving the view: stop media and keep the last note
      this.saveNote();
      if (this.renderedId) content.innerHTML = "";
      this.renderedId = null;
      return;
    }

    const entry = getEntry(id);
    if (id === this.renderedId) {
      this.updateBookmark(id);
      return;
    }
    this.saveNote();
    this.renderedId = id;
    if (!entry) {
      content.innerHTML = `<p class="missing">This entry is not part of the book (anymore).</p>`;
      return;
    }
    this.game.history.consultEntry(entry.id);
    content.innerHTML = this.entryHtml(entry);
    this.updateBookmark(id);
    this.scrollTop = 0;
  }

  private entryHtml(entry: Entry): string {
    const note = this.game.history.getNote(entry.id);
    return /* html */ `
      <table class="rule-table">
        <tr><th scope="row">Entry name</th><td>${escapeHtml(entry.title)}</td></tr>
        <tr><th scope="row">Access page</th><td>${entry.page}</td></tr>
        <tr><th scope="row">Category</th><td>${CATEGORY_LABELS[entry.category]}</td></tr>
        ${entry.category === "texts" && entry.author ? `<tr><th scope="row">Author</th><td>${escapeHtml(entry.author)}</td></tr>` : ""}
      </table>
      <div class="body">${this.categoryHtml(entry)}</div>
      <div class="actions">
        <div class="action-row">
          <button type="button" class="pill bookmark design" data-action="bookmark" aria-pressed="false"></button>
          <button type="button" class="pill add-note design" data-action="add-note" ${note ? "hidden" : ""}>${ICONS.noteAdd}<span class="gold">Add note</span></button>
        </div>
        <!-- Notes are attached to the entry (not a filter); the field only shows once there is a note -->
        <div class="note" ${note ? "" : "hidden"}>
          <label for="note">Note</label>
          <textarea id="note" maxlength="2000" placeholder="A short note for yourself">${escapeHtml(note)}</textarea>
        </div>
      </div>
    `;
  }

  private categoryHtml(entry: Entry): string {
    const text = paragraphs(entry.body).map(p => `<p>${escapeHtml(p)}</p>`).join("");
    const image = entry.image ? `<img class="entry-image" src="${escapeHtml(entry.image)}" alt="" loading="lazy">` : "";

    switch (entry.category) {
      case EntryCategory.Glossary:
        return text + image;
      case EntryCategory.Texts:
        return text;
      case EntryCategory.Videos: {
        const video = entry.target?.entity?.assets.find(a => a.assetType === "video");
        return /* html */ `
          <p>Go to access page ${entry.page} in scan mode to see the video.</p>
          ${text}
          ${video ? `<p class="hint">Preview (the AR version is shown on the page):</p>
            <video src="${escapeHtml(video.src)}" controls playsinline preload="metadata"></video>` : ""}
        `;
      }
      case EntryCategory.Links: {
        const embed = entry.media ? linkEmbed(entry.media) : undefined;
        const frame = !embed
          ? ""
          : embed.kind === "video"
            ? `<iframe class="video" src="${escapeHtml(embed.src)}" title="${escapeHtml(entry.title)}" loading="lazy"
                allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
            : `<iframe class="page" src="${escapeHtml(embed.src)}" title="${escapeHtml(entry.title)}" loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
        return /* html */ `
          ${text}
          ${frame}
          ${entry.media ? `<p><a href="${escapeHtml(entry.media)}" target="_blank" rel="noopener noreferrer">Open in a new tab</a></p>` : ""}
        `;
      }
    }
  }

  private updateBookmark(entryId: string) {
    const button = this.shadowRoot?.querySelector<HTMLButtonElement>("[data-action=bookmark]");
    if (!button) return;
    const marked = this.game.history.isMarked(entryId);
    button.setAttribute("aria-pressed", String(marked));
    button.innerHTML = `${marked ? ICONS.bookmarked : ICONS.bookmark}<span class="gold">${marked ? "Bookmarked" : "Bookmark"}</span>`;
  }

  private handleClick = (event: Event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!el || !this.renderedId) return;
    if (el.dataset.action === "bookmark") {
      this.game.history.setMarked(this.renderedId, !this.game.history.isMarked(this.renderedId));
    } else if (el.dataset.action === "add-note") {
      // Reveal the note field (hidden until the reader adds a note)
      el.hidden = true;
      const note = this.shadowRoot?.querySelector<HTMLElement>(".note");
      if (note) note.hidden = false;
      this.shadowRoot?.querySelector<HTMLTextAreaElement>("#note")?.focus();
    }
  };

  private handleInput = (event: Event) => {
    if ((event.target as HTMLElement).id !== "note") return;
    window.clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => this.saveNote(), NOTE_SAVE_MS);
  };

  private handleBlur = (event: Event) => {
    if ((event.target as HTMLElement).id === "note") this.saveNote();
  };

  private saveNote() {
    window.clearTimeout(this.noteTimer);
    const textarea = this.shadowRoot?.querySelector<HTMLTextAreaElement>("#note");
    if (textarea && this.renderedId) this.game.history.setNote(this.renderedId, textarea.value);
  }
}

customElements.define("entry-page", EntryPage);
