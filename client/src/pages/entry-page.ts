import { Pages } from "@/types";
import { getEntry } from "@/utils/game-config";
import "@/components/consultation"; // registers <entry-detail> (the named import is type-only)
import { EntryDetail } from "@/components/consultation";
import { ConsultationPage } from "./consultation-page";

/**
 * Entry view (design p.15, 20, 25, 30–31): `<entry-detail>` (meta table + content per category).
 * Opening the entry marks it consulted.
 */
export class EntryPage extends ConsultationPage {
  /** Entry currently shown – progress changes must not re-render it (media would restart) */
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
      </div>
    `;
  }

  protected update(): void {
    const root = this.shadowRoot;
    const detail = root?.querySelector<EntryDetail>("entry-detail");
    const missing = root?.querySelector<HTMLElement>(".missing");
    if (!detail || !missing) return;

    const id = this.routeParam(Pages.ENTRY);
    if (id === this.renderedId) return;
    this.renderedId = id;

    // Leaving the view (no id) empties the detail, which stops media
    const entry = id ? getEntry(id) : undefined;
    missing.hidden = !id || !!entry;
    detail.entry = entry ?? null;
    if (!entry) return;

    this.game.history.consultEntry(entry.id);
    this.scrollTop = 0;
  }
}

customElements.define("entry-page", EntryPage);
