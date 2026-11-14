import { DEFAULT_ENVIRONMENT, environmentOf, referenceExtension, SKY_IMAGE_EXTENSIONS, WORLD_MODEL_EXTENSIONS, type EnvironmentData } from "@shared/types/environment";
import { errorText, getBook, putEnvironment, type Asset } from "./api";
import { autosave } from "./autosave.svelte";
import { baselineOf, differsFromBaseline, noteBaseline } from "./baselines";
import { bookEnvironment } from "#lib/stage/sky.js";

/** The environment's two files: the world model and the sky image */
export type EnvironmentSlot = "world" | "sky";

const FIELD: Record<EnvironmentSlot, "worldSrc" | "skySrc"> = { world: "worldSrc", sky: "skySrc" };

/** An asset fits a slot by its file: a glTF model for the world, an equirectangular image (jpg, png, webp) for the sky */
export const fitsSlot = (asset: Pick<Asset, "kind" | "url">, slot: EnvironmentSlot): boolean =>
  slot === "world"
    ? (asset.kind === "glb" || asset.kind === "gltf") && (WORLD_MODEL_EXTENSIONS as readonly string[]).includes(referenceExtension(asset.url))
    : asset.kind === "image" && (SKY_IMAGE_EXTENSIONS as readonly string[]).includes(referenceExtension(asset.url));

/** The environment with a slot's file set (a URL) or removed (null: the built-in world's part again) */
export const withSlot = (environment: EnvironmentData, slot: EnvironmentSlot, url: string | null): EnvironmentData => {
  const { [FIELD[slot]]: _dropped, ...rest } = environment;
  return url ? { ...rest, [FIELD[slot]]: url } : rest;
};

/** Two environments say the same (the optional fields' absence included) */
export const sameEnvironment = (a: EnvironmentData, b: EnvironmentData): boolean =>
  a.world === b.world && a.onionSky === b.onionSky && (a.worldSrc ?? null) === (b.worldSrc ?? null) && (a.skySrc ?? null) === (b.skySrc ?? null);

/** An environment in one written form (`null`: the book has none), so two that say the same compare as the same text */
const written = (environment: EnvironmentData | null | undefined): Required<EnvironmentData> | null =>
  environment ? { world: environment.world, onionSky: environment.onionSky, worldSrc: environment.worldSrc ?? "", skySrc: environment.skySrc ?? "" } : null;

/**
 * The book's environment as the workspace edits it: the draft's (`saved`, undefined = the
 * book has none, the default applies), the values being edited (`edited` – the stage previews them live) and the slot
 * the Library is choosing a file for (`picking` – the Environment tab shows the Library as its picker meanwhile). Kept
 * across the workspace's tabs. Every edit reaches the draft by itself a moment later (#259,
 * `PUT /editor/books/{id}/environment`); *Undo edits* goes back to the environment the draft had before the first edit
 * in this page.
 */
class EnvironmentEdit {
  bookId = $state<string | null>(null);
  saved = $state<EnvironmentData | undefined>(undefined);
  edited = $state<EnvironmentData>({ ...DEFAULT_ENVIRONMENT });
  picking = $state<EnvironmentSlot | null>(null);
  /** The draft's environment could not be read */
  error = $state<string | null>(null);
  /** The draft holds an edit now: the workspace reads the draft again (this store knows neither the content nor the Library) */
  onsaved: ((bookId: string) => Promise<void>) | null = null;

  /** The edited values are not in the draft yet */
  get dirty(): boolean {
    return !sameEnvironment(this.edited, environmentOf({ environment: this.saved }));
  }

  /** The environment as a subject of the autosaver and of *Undo edits* */
  private get key(): string {
    return `environment:${this.bookId}`;
  }

  /** The environment is not as the draft had it before its first edit in this page */
  get canUndo(): boolean {
    return differsFromBaseline(this.key, written(this.saved || this.dirty ? this.edited : null));
  }

  /** Read the draft's environment (a book switch, or after a save); edits in progress for the same book stay. A failed
   * read is `error` (the Environment tab shows it) – it never rejects, so the workspace's effect may fire and forget */
  async load(bookId: string, force = false): Promise<void> {
    if (this.bookId === bookId && !force) return;
    let book: Awaited<ReturnType<typeof getBook>>["book"];
    try {
      ({ book } = await getBook(bookId));
    } catch (e) {
      this.error = errorText(e);
      return;
    }
    this.error = null;
    const keep = this.bookId === bookId && this.dirty && !force;
    this.bookId = bookId;
    this.saved = book.book?.environment;
    if (!keep) this.edited = { ...environmentOf({ environment: this.saved }) };
  }

  set(patch: Partial<EnvironmentData>): void {
    this.edit({ ...this.edited, ...patch });
  }

  use(slot: EnvironmentSlot, url: string | null): void {
    this.edit(withSlot(this.edited, slot, url));
    this.picking = null;
  }

  /** Undo edits: the environment as the draft had it before its first edit in this page (none: the default again) */
  undo(): void {
    const before = baselineOf<Required<EnvironmentData>>(this.key);
    if (before === undefined) return;
    if (before) this.edit(withSlot(withSlot({ world: before.world, onionSky: before.onionSky }, "world", before.worldSrc || null), "sky", before.skySrc || null));
    else this.useDefault();
  }

  /** Remove the book's environment: the default applies (the café with the onion sky) */
  useDefault(): void {
    this.edit({ ...DEFAULT_ENVIRONMENT }, null);
  }

  /**
   * An edit: previewed at once, written to the draft a moment after the last one (`write`: the values, or `null` – the
   * book keeps none)
   */
  private edit(next: EnvironmentData, write: EnvironmentData | null = next): void {
    const bookId = this.bookId;
    if (!bookId) return;
    noteBaseline(this.key, written(this.saved ? environmentOf({ environment: this.saved }) : null));
    this.edited = next;
    autosave.queue(this.key, async () => {
      const { environment: stored } = await putEnvironment(bookId, write);
      if (this.bookId === bookId) {
        // Values edited again meanwhile stay: their own save follows
        const untouched = sameEnvironment(this.edited, next);
        this.saved = stored ?? undefined;
        if (untouched) this.edited = { ...environmentOf({ environment: this.saved }) };
      }
      // The draft carries it now; the stage shows the same values already
      await this.onsaved?.(bookId);
    });
  }
}

export const environmentEdit = new EnvironmentEdit();

/**
 * The book's environment as the stage shows it in place of the HDRI (#185, `stage/sky.ts`): the edited values once the
 * book has one or the author has started one, null while it has none (the reader's default world is not drawn then –
 * the HDRI stays). Reactive: the toolbar, the Inspector and the stage follow it.
 */
export const stageEnvironment = {
  get current(): EnvironmentData | null {
    return environmentEdit.bookId ? bookEnvironment(environmentEdit.saved, environmentEdit.edited, environmentEdit.dirty) : null;
  },
};
