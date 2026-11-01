import { errorText, getEntries, type EditorEntry, type EntryFields } from "./api";

/**
 * The book's entries as the content holds them (#223, `GET /editor/books/{id}/entries`): every field as written – an
 * image's path unresolved, which the draft the engine reads resolves – with each entry's spread and target. The entry
 * form edits from here and puts a save back (`saved`). One book at a time.
 */
class Entries {
  bookId = $state<string | null>(null);
  list = $state<EditorEntry[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  /** Read the book's entries (again) */
  async load(bookId: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const { entries } = await getEntries(bookId);
      this.list = entries;
      this.bookId = bookId;
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.loading = false;
    }
  }

  byId(id: string | null | undefined): EditorEntry | undefined {
    return id ? this.list.find(entry => entry.id === id) : undefined;
  }

  /** A save's answer: the entry's fields and its spread now, its target as it was */
  saved(entry: EntryFields, spreadId: string | null): void {
    this.list = this.list.map(e => (e.id === entry.id ? { ...entry, spreadId, target: e.target } : e));
  }
}

export const entries = new Entries();
