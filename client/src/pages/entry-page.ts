import { Pages } from "@/types";
import { getEntry } from "@/utils/game-config";
import { EntryActions, EntryDetail } from "@/components/consultation";
import { ConsultationPage } from "./consultation-page";

/**
 * Entry view (design p.15, 20, 25, 30–31): `<entry-detail>` (meta table + content per category) and
 * `<entry-actions>` (bookmark, note). Opening the entry marks it consulted.
 */
export class EntryPage extends ConsultationPage {
  /** Entry currently shown – progress changes (bookmark, note) must not re-render it */
  private renderedId: string | null = null;

  get styles(): string {
    return /* css */ `
      .missing { color: var(--color-muted); }
      [hidden] { display: none !important; }
    `;
  }

  get template(): string {
    return /* html */ `
      <div class="content">
        <p class="missing" hidden>This entry is not part of the book (anymore).</p>
        <entry-detail></entry-detail>
        <entry-actions></entry-actions>
      </div>
    `;
  }

  protected update(): void {
    const root = this.shadowRoot;
    const detail = root?.querySelector<EntryDetail>("entry-detail");
    const actions = root?.querySelector<EntryActions>("entry-actions");
    const missing = root?.querySelector<HTMLElement>(".missing");
    if (!detail || !actions || !missing) return;

    const id = this.routeParam(Pages.ENTRY);
    if (id === this.renderedId) return;
    this.renderedId = id;

    // Leaving the view (no id): stops media and saves the note
    const entry = id ? getEntry(id) : undefined;
    missing.hidden = !id || !!entry;
    detail.entry = entry ?? null;
    actions.entryId = entry ? entry.id : null;
    if (!entry) return;

    this.game.history.consultEntry(entry.id);
    this.scrollTop = 0;
  }
}

customElements.define("entry-page", EntryPage);
