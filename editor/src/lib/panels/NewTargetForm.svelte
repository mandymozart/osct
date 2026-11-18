<script lang="ts">
  import type { EntityData, EntityType, EntryCategory, Spread } from "@engine/types";
  import { addEntry, errorText, isMediaAsset, type Asset } from "#lib/api.js";
  import { library } from "#lib/library.svelte.js";
  import { nodeAssetKinds, pickAccept, type LibraryPick } from "#lib/library-pick.js";
  import { APPEARS, CATEGORIES, CATEGORY_LABELS, categoryFor } from "#lib/new-target.js";
  import { choiceOf, placeOnChoice, surfaceChoices } from "#lib/surface-edit.js";
  import { sceneLabel } from "@engine/content/scenes";
  import { newNode } from "#lib/values.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import { flatFrame, fromOrigin, toOrigin } from "#lib/stage/origin.js";
  import { getPreview, subscribePreview } from "#lib/stage/preview.js";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import FileField from "#lib/components/FileField.svelte";
  import LibraryPanel from "./LibraryPanel.svelte";

  /**
   * A new target on the open scene (the tree's "+ target"): an entry (title, on this scene) with its printed image, **what
   * appears on it** (optional: a node of a type with its file, a text's line) and the **entry category** (the reader's
   * consultation menu – it follows what appears until set by hand, `categoryFor`), and where it is printed – the scene's
   * surface (when it has several), x / y from the surface's top left corner and the printed width in mm (`place`). Files are chosen
   * in the Library as a picker (`FileField` → `LibraryPanel` with `pick`, the form kept underneath) or uploaded. The
   * API makes entry and target (`POST …/entries`); the caller reloads the content and selects the new target. The
   * reader tracks it after a publish: the 8th Wall engine makes the image-target data from the image at runtime.
   */
  let { bookId, spread, stage = null, oncreated, oncancel }: {
    bookId: string;
    spread: Spread;
    /** The stage shows the placement live (a translucent image where the target would be printed) */
    stage?: Stage | null;
    oncreated: (targetId: string) => Promise<void>;
    oncancel: () => void;
  } = $props();

  let title = $state("");
  let imageUrl = $state("");
  /** The surfaces the print may lie on: the scene's, by id */
  const surfaceOptions = $derived(surfaceChoices(spread.surfaces));
  const surfaceLabels = $derived(Object.fromEntries(surfaceOptions.map(c => [c.value, c.label])));
  /** The surface it lies on, by id (`TargetPlace.surface`) – none: the scene's first */
  let surface = $state<string | undefined>(undefined);
  const chooseSurface = (value: string) => {
    const choice = surfaceOptions.find(c => c.value === value);
    if (choice) surface = placeOnChoice({ surface }, choice, surfaceOptions).surface;
  };
  /** The surface the fields count on: the chosen one, else the first */
  const on = $derived(choiceOf(surfaceOptions, { surface }) ?? undefined);
  let x = $state(40);
  let y = $state(60);
  // The x / y rows are read and entered from the stage's origin (the toolbar's view group); x / y keep the content's frame
  let origin = $state(getPreview().origin);
  $effect(() => subscribePreview(state => (origin = state.origin)));
  const frame = $derived(flatFrame(spread.surfaces));
  const shown = $derived(toOrigin(origin, frame, on, x, y));
  const setShown = (nx: number, ny: number) => ({ x, y } = fromOrigin(origin, frame, on, nx, ny));
  let width = $state(80);
  let busy = $state(false);
  let error = $state<string | null>(null);
  // What appears on the page (optional): a node of a type, its file from the library, a text's line
  let entityType = $state<EntityType | "">("");
  let entityFile = $state("");
  let entityText = $state("{{entry.title}}");
  const needsFile = $derived(!!entityType && !!nodeAssetKinds(entityType));
  const entityReady = $derived(!needsFile || !!entityFile);
  const setEntityType = (type: EntityType | "") => {
    entityType = type;
    entityFile = "";
  };
  // The entry category follows what appears until the author sets one
  let chosenCategory = $state<EntryCategory | null>(null);
  const category = $derived(chosenCategory ?? categoryFor(entityType));
  /** The Library open as a picker for one of the form's files (the form keeps its values underneath) */
  let picking = $state<LibraryPick | null>(null);
  const pickImage = () => {
    picking = { subject: { for: "target-image" }, label: "the new target's printed image", current: imageUrl,
      onpick: asset => { imageUrl = asset.url; picking = null; }, oncancel: () => (picking = null) };
  };
  const pickEntityFile = () => {
    if (!entityType) return;
    picking = { subject: { for: "node", nodeType: entityType }, label: `the ${entityType} on the page`, current: entityFile,
      onpick: asset => { entityFile = asset.url; picking = null; }, oncancel: () => (picking = null) };
  };
  const uploadForEntity = async (file: File) => {
    error = null;
    try {
      const asset = await library.upload(bookId, file);
      if (entityType && nodeAssetKinds(entityType)?.includes(asset.kind)) entityFile = asset.url;
      else error = `${asset.name} is a ${asset.kind}, not for a ${entityType || "node"}`;
    } catch (e) {
      error = errorText(e);
    }
  };
  const entityData = (): EntityData | undefined => {
    if (!entityType) return undefined;
    const found = library.byUrl(entityFile);
    const asset = found && isMediaAsset(found) ? found : undefined;
    const node = newNode(entityType, asset ? { id: `new-${asset.id.slice(0, 8)}`, assetType: asset.kind, src: asset.url } : undefined, asset);
    if (entityType === "text") node.text = entityText;
    return node;
  };

  $effect(() => {
    if (library.bookId !== bookId) void library.load(bookId);
  });

  // The stage shows where the target would lie while the form is open
  $effect(() => {
    const url = imageUrl;
    const where = { ...(surface ? { surface } : {}), x, y, width };
    stage?.ghost(url ? { imageSrc: url, ...where } : null);
  });
  $effect(() => () => stage?.ghost(null));
  // The handles on the stage move the ghost: the fields follow
  $effect(() => {
    if (!stage) return;
    stage.onGhostChange = place => { surface = place.surface; x = place.x; y = place.y; width = place.width; };
    return () => { if (stage) stage.onGhostChange = null; };
  });

  const upload = async (file: File) => {
    error = null;
    try {
      const asset: Asset = await library.upload(bookId, file, "target");
      imageUrl = asset.url;
    } catch (e) {
      error = errorText(e);
    }
  };
  const create = async () => {
    if (!title.trim() || !imageUrl) return;
    busy = true;
    error = null;
    try {
      const entity = entityData();
      const { entry } = await addEntry(bookId, {
        title: title.trim(), scene: spread.id, ...(surface ? { surface } : {}), category,
        target: { imageSrc: imageUrl, place: { ...(surface ? { surface } : {}), x, y, width }, ...(entity ? { entity } : {}) },
      });
      await oncreated(entry.target?.id ?? entry.id);
    } catch (e) {
      error = errorText(e, { code: true });
    } finally {
      busy = false;
    }
  };
</script>

{#if picking}
  <LibraryPanel {bookId} pick={picking} />
{:else}
<div class="form">
  <div class="section"><span class="section-label">new target on {sceneLabel(spread)}</span>
    <button type="button" class="text-link" onclick={oncancel}>cancel</button></div>
  <div class="row"><span class="label">title</span>
    <input class="field" bind:value={title} placeholder="what the entry is about" aria-label="Title" /></div>
  <div class="row" data-help-name="Printed image" data-help="The picture printed in the book that the reader's camera finds: chosen in the Library (target images first) or uploaded.">
    <span class="label">image</span>
    <FileField src={imageUrl} empty="none yet" accept={pickAccept({ for: "target-image" })} label="the printed image" onlibrary={pickImage} onupload={f => void upload(f)} />
  </div>
  {#if imageUrl}<div class="row"><span class="label"></span><img class="preview" src={imageUrl} alt="" /></div>{/if}

  <div class="section"><span class="section-label">what appears on the page</span></div>
  <div class="row" data-help-name="What appears on the page" data-help="The AR content the reader sees on the printed image: a 3D model, a video, an image, a line of text, a group to hold several, or a light – more nodes in the Inspector afterwards. None leaves the target without AR content for now.">
    <span class="label">content</span>
    <span class="controls"><Segmented options={APPEARS} value={entityType} labels={{ "": "none" }} titles={{ model: "A 3D model (glb, gltf)" }} onchange={setEntityType} /></span></div>
  {#if needsFile}
    <div class="row"><span class="label">{entityType === "model" ? "model" : "file"}</span>
      <FileField src={entityFile} picture={entityType === "image"} empty={`no ${entityType} file yet`} accept={pickAccept({ for: "node", nodeType: entityType })}
        label="the {entityType} file" onlibrary={pickEntityFile} onupload={f => void uploadForEntity(f)} />
    </div>
  {/if}
  {#if entityType === "text"}
    <div class="row"><span class="label">text</span><input class="field" bind:value={entityText} aria-label="Text" /></div>
  {/if}

  <div class="section"><span class="section-label">entry category</span></div>
  <div class="row" data-help-name="Entry category" data-help="Where the entry is listed in the reader's consultation menu (Marginalia – the glossary –, Texts, Links, or the Videos) – not what appears on the page. It follows what appears (a video makes a Videos entry) until you choose one.">
    <span class="label">listed in</span>
    <span class="controls"><Segmented options={CATEGORIES} value={category} labels={CATEGORY_LABELS} onchange={c => (chosenCategory = c)} /></span></div>

  <!-- The explanation is the section's help, not its title (RULES #32 – #170) -->
  <div class="section" data-help-name="Printed on the surface" data-help="Where the image is printed: the scene's surface (when it has several), x / y in mm from the origin set in the toolbar's view group, and the printed width."><span class="section-label">printed on the surface</span></div>
  {#if surfaceOptions.length > 1}
    <div class="row"><span class="label">surface</span>
      <span class="controls"><Segmented options={surfaceOptions.map(c => c.value)} labels={surfaceLabels} value={on ?? ""} label="Surface" onchange={chooseSurface} /></span></div>
  {/if}
  <div class="row"><span class="label">x · y</span>
    <span class="fields">
      <ScrubNumber value={shown.x} step={1} fallback={0} prefix="X" unit="mm" label="x from the origin" oninput={v => setShown(v, shown.y)} />
      <ScrubNumber value={shown.y} step={1} fallback={0} prefix="Y" unit="mm" label="y from the origin" oninput={v => setShown(shown.x, v)} />
    </span></div>
  <div class="row"><span class="label">width</span>
    <span class="w"><ScrubNumber value={width} min={10} max={2000} step={1} fallback={80} unit="mm" label="printed width" positive oninput={v => (width = v)} /></span></div>
  <div class="actions">
    <span class="grow"></span>
    {#if library.uploading.length}<span class="small muted">uploading…</span>{/if}
    {#if error}<span class="small danger">{error}</span>{/if}
    <button type="button" class="pill primary" disabled={busy || !title.trim() || !imageUrl || !entityReady} onclick={create}>{busy ? "Creating…" : "Create target"}</button>
  </div>
</div>
{/if}

<style>
  .form { display: flex; flex-direction: column; gap: .125rem; }
  .row > .field { width: 100%; }
  .preview { max-width: 8rem; max-height: 6rem; border: 1px solid var(--line); border-radius: var(--control-radius); object-fit: contain; }
  .fields :global(.scrub) { width: 100%; }
  .w { width: 7rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
