import { GameStoreService } from "@/services/GameStoreService";
import { IGame } from "@/types";
import { adoptDesignStyles } from "@/styles/design-styles";
import { escapeHtml } from "@/utils";
import { ICONS } from "./icons";

const NOTE_SAVE_MS = 400;

/**
 * Bookmark and note of one entry (PLAN Phase 4, placeholder icons). Notes belong to the entry (not a
 * filter): the field stays hidden behind "Add note" until the reader adds one. The note is saved while
 * typing (debounced), on blur, and when the entry changes or the element is removed.
 * The page sets `entryId`; `null` saves and empties it.
 */
export class EntryActions extends HTMLElement {
  private game: Readonly<IGame>;
  private _entryId: string | null = null;
  private noteTimer: number | undefined;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
    adoptDesignStyles(this.shadowRoot);
  }

  get entryId(): string | null {
    return this._entryId;
  }

  set entryId(id: string | null) {
    if (id === this._entryId) return;
    this.saveNote();
    this._entryId = id;
    this.render();
  }

  connectedCallback() {
    this.shadowRoot?.addEventListener("click", this.handleClick);
    this.shadowRoot?.addEventListener("input", this.handleInput);
    this.shadowRoot?.addEventListener("focusout", this.handleBlur);
    // Bookmark changes update the button only – a re-render would reset the note field
    this.unsubscribe = this.game.subscribeToProperty("progress", () => this.updateBookmark());
    this.render();
  }

  disconnectedCallback() {
    this.saveNote();
    this.shadowRoot?.removeEventListener("click", this.handleClick);
    this.shadowRoot?.removeEventListener("input", this.handleInput);
    this.shadowRoot?.removeEventListener("focusout", this.handleBlur);
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private render() {
    if (!this.shadowRoot) return;
    const id = this._entryId;
    if (!id) {
      this.shadowRoot.innerHTML = "";
      return;
    }
    const note = this.game.history.getNote(id);
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host { display: block; margin-top: 2rem; }
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
      </style>
      <div class="action-row">
        <button type="button" class="pill bookmark design" data-action="bookmark" aria-pressed="false"></button>
        <button type="button" class="pill add-note design" data-action="add-note" ${note ? "hidden" : ""}>${ICONS.noteAdd}<span class="gold">Add note</span></button>
      </div>
      <div class="note" ${note ? "" : "hidden"}>
        <label for="note">Note</label>
        <textarea id="note" maxlength="2000" placeholder="A short note for yourself">${escapeHtml(note)}</textarea>
      </div>
    `;
    this.updateBookmark();
  }

  private updateBookmark() {
    const button = this.shadowRoot?.querySelector<HTMLButtonElement>("[data-action=bookmark]");
    if (!button || !this._entryId) return;
    const marked = this.game.history.isMarked(this._entryId);
    if (button.getAttribute("aria-pressed") === String(marked) && button.childElementCount) return;
    button.setAttribute("aria-pressed", String(marked));
    button.innerHTML = `${marked ? ICONS.bookmarked : ICONS.bookmark}<span class="gold">${marked ? "Bookmarked" : "Bookmark"}</span>`;
  }

  private handleClick = (event: Event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    const id = this._entryId;
    if (!el || !id) return;
    if (el.dataset.action === "bookmark") {
      this.game.history.setMarked(id, !this.game.history.isMarked(id));
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
    if (textarea && this._entryId) this.game.history.setNote(this._entryId, textarea.value);
  }
}

customElements.define("entry-actions", EntryActions);
