import { errorText, getEntries, type EditorEntry, type EntryFields } from "./api";

/**
 * The experience's entries as the content holds them (#223, `GET /editor/experiences/{id}/entries`): every field as written – an
 * image's path unresolved, which the draft the engine reads resolves – with each entry's scene and target. The entry
 * form edits from here and puts a save back (`saved`). One experience at a time.
 */
class Entries {
  experienceId = $state<string | null>(null);
  list = $state<EditorEntry[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  /** Read the experience's entries (again) */
  async load(experienceId: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const { entries } = await getEntries(experienceId);
      this.list = entries;
      this.experienceId = experienceId;
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.loading = false;
    }
  }

  byId(id: string | null | undefined): EditorEntry | undefined {
    return id ? this.list.find(entry => entry.id === id) : undefined;
  }

  /** A save's answer: the entry's fields (its scene now), its target as it was */
  saved(entry: EntryFields): void {
    this.list = this.list.map(e => (e.id === entry.id ? { ...entry, target: e.target } : e));
  }
}

export const entries = new Entries();
