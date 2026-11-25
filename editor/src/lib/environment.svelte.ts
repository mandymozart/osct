import { DEFAULT_ENVIRONMENT, environmentOf, referenceExtension, SKY_IMAGE_EXTENSIONS, type EnvironmentData } from "@shared/types/environment";
import { errorText, getExperience, putEnvironment, type Asset } from "./api";
import { autosave } from "./autosave.svelte";
import { baselineOf, differsFromBaseline, noteBaseline } from "./baselines";

/** The environment's file: the sky image. The world model is gone (#310) – a content's `worldSrc` is kept, never set here */
export type EnvironmentSlot = "sky";

const FIELD: Record<EnvironmentSlot, "skySrc"> = { sky: "skySrc" };

/** An asset fits the sky by its file: an equirectangular image (jpg, png, webp) */
export const fitsSlot = (asset: Pick<Asset, "kind" | "url">, _slot: EnvironmentSlot): boolean =>
  asset.kind === "image" && (SKY_IMAGE_EXTENSIONS as readonly string[]).includes(referenceExtension(asset.url));

/** The environment with a slot's file set (a URL) or removed (null: none) */
export const withSlot = (environment: EnvironmentData, slot: EnvironmentSlot, url: string | null): EnvironmentData => {
  const { [FIELD[slot]]: _dropped, ...rest } = environment;
  return url ? { ...rest, [FIELD[slot]]: url } : rest;
};

/** Two environments say the same (the optional fields' absence included) */
export const sameEnvironment = (a: EnvironmentData, b: EnvironmentData): boolean =>
  a.world === b.world && a.onionSky === b.onionSky && (a.worldSrc ?? null) === (b.worldSrc ?? null) && (a.skySrc ?? null) === (b.skySrc ?? null);

/** An environment in one written form (`null`: the experience has none), so two that say the same compare as the same text */
const written = (environment: EnvironmentData | null | undefined): Required<EnvironmentData> | null =>
  environment ? { world: environment.world, onionSky: environment.onionSky, worldSrc: environment.worldSrc ?? "", skySrc: environment.skySrc ?? "" } : null;

/**
 * The experience's environment as the workspace edits it: the draft's (`saved`, undefined = the
 * experience has none, the default applies), the values being edited (`edited` – the stage previews them live) and the slot
 * the Library is choosing a file for (`picking` – the Environment tab shows the Library as its picker meanwhile). Kept
 * across the workspace's tabs. Every edit reaches the draft by itself a moment later (#259,
 * `PUT /editor/experiences/{id}/environment`); *Undo edits* goes back to the environment the draft had before the first edit
 * in this page.
 */
class EnvironmentEdit {
  experienceId = $state<string | null>(null);
  saved = $state<EnvironmentData | undefined>(undefined);
  edited = $state<EnvironmentData>({ ...DEFAULT_ENVIRONMENT });
  picking = $state<EnvironmentSlot | null>(null);
  /** The draft's environment could not be read */
  error = $state<string | null>(null);
  /** The draft holds an edit now: the workspace reads the draft again (this store knows neither the content nor the Library) */
  onsaved: ((experienceId: string) => Promise<void>) | null = null;

  /** The edited values are not in the draft yet */
  get dirty(): boolean {
    return !sameEnvironment(this.edited, environmentOf({ environment: this.saved }));
  }

  /** The environment as a subject of the autosaver and of *Undo edits* */
  private get key(): string {
    return `environment:${this.experienceId}`;
  }

  /** The environment is not as the draft had it before its first edit in this page */
  get canUndo(): boolean {
    return differsFromBaseline(this.key, written(this.saved || this.dirty ? this.edited : null));
  }

  /** Read the draft's environment (an experience switch, or after a save); edits in progress for the same experience stay. A failed
   * read is `error` (the Environment tab shows it) – it never rejects, so the workspace's effect may fire and forget */
  async load(experienceId: string, force = false): Promise<void> {
    if (this.experienceId === experienceId && !force) return;
    let experience: Awaited<ReturnType<typeof getExperience>>["experience"];
    try {
      ({ experience } = await getExperience(experienceId));
    } catch (e) {
      this.error = errorText(e);
      return;
    }
    this.error = null;
    const keep = this.experienceId === experienceId && this.dirty && !force;
    this.experienceId = experienceId;
    this.saved = experience.experience.environment;
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
    if (before) this.edit(withSlot({ world: before.world, onionSky: before.onionSky, ...(before.worldSrc ? { worldSrc: before.worldSrc } : {}) }, "sky", before.skySrc || null));
    else this.useDefault();
  }

  /** Remove the experience's environment: the default applies (nothing around the experience) */
  useDefault(): void {
    this.edit({ ...DEFAULT_ENVIRONMENT }, null);
  }

  /**
   * An edit: previewed at once, written to the draft a moment after the last one (`write`: the values, or `null` – the
   * experience keeps none)
   */
  private edit(next: EnvironmentData, write: EnvironmentData | null = next): void {
    const experienceId = this.experienceId;
    if (!experienceId) return;
    noteBaseline(this.key, written(this.saved ? environmentOf({ environment: this.saved }) : null));
    this.edited = next;
    autosave.queue(this.key, async () => {
      const { environment: stored } = await putEnvironment(experienceId, write);
      if (this.experienceId === experienceId) {
        // Values edited again meanwhile stay: their own save follows
        const untouched = sameEnvironment(this.edited, next);
        this.saved = stored ?? undefined;
        if (untouched) this.edited = { ...environmentOf({ environment: this.saved }) };
      }
      // The draft carries it now; the stage shows the same values already
      await this.onsaved?.(experienceId);
    });
  }
}

export const environmentEdit = new EnvironmentEdit();
