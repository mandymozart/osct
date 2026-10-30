import { DEFAULT_ENVIRONMENT, environmentOf, referenceExtension, SKY_IMAGE_EXTENSIONS, WORLD_MODEL_EXTENSIONS, type EnvironmentData } from "@shared/types/environment";
import { getBook, putEnvironment, type Asset } from "./api";
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

/**
 * The book's environment as the workspace edits it (content schema 2.8 / 2.10): the draft's (`saved`, undefined = the
 * book has none, the default applies), the values being edited (`edited` – the stage previews them live) and the slot
 * the Library is choosing a file for (`picking` – the Environment tab shows the Library as its picker meanwhile). Kept
 * across the workspace's tabs; **Save** writes it to the draft (`PUT /editor/books/{id}/environment`).
 */
class EnvironmentEdit {
  bookId = $state<string | null>(null);
  saved = $state<EnvironmentData | undefined>(undefined);
  edited = $state<EnvironmentData>({ ...DEFAULT_ENVIRONMENT });
  picking = $state<EnvironmentSlot | null>(null);
  saving = $state(false);
  error = $state<string | null>(null);

  get dirty(): boolean {
    return !sameEnvironment(this.edited, environmentOf({ environment: this.saved }));
  }

  /** Read the draft's environment (a book switch, or after a save); edits in progress for the same book stay */
  async load(bookId: string, force = false): Promise<void> {
    if (this.bookId === bookId && !force) return;
    const { book } = await getBook(bookId);
    const keep = this.bookId === bookId && this.dirty && !force;
    this.bookId = bookId;
    this.saved = book.book?.environment;
    if (!keep) this.edited = { ...environmentOf({ environment: this.saved }) };
  }

  set(patch: Partial<EnvironmentData>): void {
    this.edited = { ...this.edited, ...patch };
  }

  use(slot: EnvironmentSlot, url: string | null): void {
    this.edited = withSlot(this.edited, slot, url);
    this.picking = null;
  }

  revert(): void {
    this.edited = { ...environmentOf({ environment: this.saved }) };
  }

  /** Write the edited values (or `null`: remove the book's environment, the default applies) to the draft */
  async save(environment: EnvironmentData | null = this.edited): Promise<boolean> {
    if (!this.bookId) return false;
    this.saving = true;
    this.error = null;
    try {
      const { environment: stored } = await putEnvironment(this.bookId, environment);
      this.saved = stored ?? undefined;
      this.edited = { ...environmentOf({ environment: this.saved }) };
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      this.saving = false;
    }
  }
}

export const environmentEdit = new EnvironmentEdit();

/**
 * The book's environment as the stage shows it in place of the HDRI (#185, `stage/sky.ts`): the edited values once the
 * book has one or the author has started one, null while it has none (the reader's default world is not drawn then –
 * the HDRI stays). Reactive: the toolbar, the Stage panel and the stage follow it.
 */
export const stageEnvironment = {
  get current(): EnvironmentData | null {
    return environmentEdit.bookId ? bookEnvironment(environmentEdit.saved, environmentEdit.edited, environmentEdit.dirty) : null;
  },
};
