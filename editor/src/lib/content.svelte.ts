import { getBook as getConfigBook, getConfigVersion, getPlugins, getSpreads, loadGameConfiguration } from "@engine/content/game-config";
import type { ErrorInfo, PassData, Spread } from "@engine/types";
import { authFetch, draftBaseUrl, getBook } from "./api";
import { adoptRecordedSpecs } from "#lib/plugins/recorded.js";
import { plugins } from "./plugins.svelte";

/**
 * The book's draft as the engine sees it: `loadGameConfiguration` reads the draft endpoint like the CDN
 * (`latest.json` → `<build>/game.config.json`), so the stage renders exactly what the reader would after a publish.
 * One configuration at a time (the engine's content runtime is a singleton): opening another book reloads.
 */
class Content {
  bookId = $state<string | null>(null);
  spreads = $state<Spread[]>([]);
  /** The book's post-processing (`book.passes`, the master of every spread without its own); null = the book has none */
  bookPasses = $state<PassData[] | null>(null);
  hash = $state<string | null>(null);
  error = $state<ErrorInfo | null>(null);
  loading = $state(false);

  /** Where the book's content files live (the import's `assetsBase`), read once per book */
  assetsBase = $state<string | null>(null);

  /** Load (or reload after a save) the book's draft; resolves with the startup error, if any */
  async load(bookId: string): Promise<ErrorInfo | null> {
    this.loading = true;
    try {
      if (this.bookId !== bookId || this.assetsBase === null) this.assetsBase = (await getBook(bookId)).book.assetsBase;
      // The stage is the sandbox: a node may use a component the Code tab's plugins register at Run
      const error = await loadGameConfiguration({ baseUrl: draftBaseUrl(bookId), fetch: authFetch, assetsBase: this.assetsBase || undefined, unknownComponentTypes: "allow" });
      this.bookId = bookId;
      this.error = error;
      this.spreads = error ? [] : getSpreads();
      this.bookPasses = error ? null : getConfigBook().passes ?? null;
      this.hash = error ? null : getConfigVersion().hash ?? null;
      // What the declared plugins recorded: the Inspector's rows before they load or run
      adoptRecordedSpecs(error ? [] : getPlugins());
      plugins.version += 1;
      return error;
    } finally {
      this.loading = false;
    }
  }

  spread(id: string): Spread | undefined {
    return this.spreads.find(spread => spread.id === id);
  }

  neighbour(id: string, direction: 1 | -1): Spread | undefined {
    const index = this.spreads.findIndex(spread => spread.id === id);
    if (index < 0 || !this.spreads.length) return undefined;
    return this.spreads[(index + direction + this.spreads.length) % this.spreads.length];
  }
}

export const content = new Content();
