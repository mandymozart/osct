<script lang="ts">
  import type { EntityData, EntityType, Spread } from "@engine/types";
  import { addEntry, ApiError, type Asset } from "$lib/api";
  import { ACCEPT, library, NODE_ASSET_KINDS } from "$lib/library.svelte";
  import { newNode } from "$lib/values";
  import type { Stage } from "$lib/stage/stage.svelte";
  import ScrubNumber from "$lib/components/ScrubNumber.svelte";
  import Segmented from "$lib/components/Segmented.svelte";

  /**
   * A new target on the spread (the tree's "+ target"): an entry (title, page, category) with its printed image from
   * the library (or uploaded here) and where it is printed – surface, x / y from the page's top left corner and the
   * printed width in mm (`print`, content schema 2.1). The API makes entry and target (`POST …/entries`); the
   * caller reloads the content and selects the new target. The reader tracks it after a publish: the 8th Wall
   * engine makes the image-target data from the image at runtime.
   */
  let { bookId, spread, stage = null, oncreated, oncancel }: {
    bookId: string;
    spread: Spread;
    /** The stage shows the placement live (a translucent image where the target would be printed) */
    stage?: Stage | null;
    oncreated: (targetId: string) => Promise<void>;
    oncancel: () => void;
  } = $props();

  const pages = $derived(Array.from({ length: spread.lastPage - spread.firstPage + 1 }, (_, i) => spread.firstPage + i));
  const CATEGORIES = ["glossary", "video", "text", "link"] as const;
  let title = $state("");
  // svelte-ignore state_referenced_locally
  let page = $state(spread.firstPage);
  let category = $state<(typeof CATEGORIES)[number]>("glossary");
  let imageUrl = $state("");
  const format = $derived(spread.format ?? "spread");
  const closed = $derived(format === "cover" || format === "back");
  const surfaces = $derived<readonly ("left" | "right" | "front" | "back")[]>(closed ? [format === "cover" ? "front" : "back"] : ["left", "right"]);
  const pageLabel = (p: number) => (format === "cover" ? "cover" : format === "back" ? "back cover" : String(p));
  let surface = $state<"left" | "right" | "front" | "back">("right");
  let x = $state(40);
  let y = $state(60);
  let width = $state(80);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement>();
  // The AR content the target shows (optional): a node of a type, its file from the library, a text's line
  const ENTITY_TYPES: readonly (EntityType | "")[] = ["", "model", "video", "image", "text", "group"];
  let entityType = $state<EntityType | "">("");
  let entityFile = $state("");
  let entityText = $state("{{entry.title}}");
  let entityInput = $state<HTMLInputElement>();
  const entityFiles = $derived(entityType && NODE_ASSET_KINDS[entityType] ? library.ofKinds(NODE_ASSET_KINDS[entityType]) : []);
  const entityReady = $derived(!entityType || !NODE_ASSET_KINDS[entityType] || !!entityFile);
  const uploadForEntity = async (file: File) => {
    error = null;
    try {
      const asset = await library.upload(bookId, file);
      if (entityType && NODE_ASSET_KINDS[entityType]?.includes(asset.kind)) entityFile = asset.url;
      else error = `${asset.name} is a ${asset.kind}, not for a ${entityType || "node"}`;
    } catch (e) {
      error = e instanceof ApiError ? e.message : String(e);
    }
  };
  const entityData = (): EntityData | undefined => {
    if (!entityType) return undefined;
    const asset = library.byUrl(entityFile);
    const node = newNode(entityType, asset ? { id: `new-${asset.id.slice(0, 8)}`, assetType: asset.kind, src: asset.url } : undefined);
    if (entityType === "text") node.text = entityText;
    return node;
  };

  $effect(() => {
    if (library.bookId !== bookId) void library.load(bookId);
  });
  const images = $derived(library.ofKinds(["image"]));
  // The first page of a double page is the left one
  $effect(() => {
    surface = closed ? surfaces[0] : pages.length > 1 && page === spread.firstPage ? "left" : "right";
  });

  // The stage shows where the target would lie while the form is open
  $effect(() => {
    const url = imageUrl;
    const where = { surface, x, y, width };
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
      const asset: Asset = await library.upload(bookId, file);
      imageUrl = asset.url;
    } catch (e) {
      error = e instanceof ApiError ? e.message : String(e);
    }
  };
  const create = async () => {
    if (!title.trim() || !imageUrl) return;
    busy = true;
    error = null;
    try {
      const entity = entityData();
      const { entry } = await addEntry(bookId, {
        title: title.trim(), page, category,
        target: { imageSrc: imageUrl, print: { page, surface, x, y, width }, ...(entity ? { entity } : {}) },
      });
      await oncreated(entry.target.id);
    } catch (e) {
      error = e instanceof ApiError ? `${e.message} (${e.code})` : String(e);
    } finally {
      busy = false;
    }
  };
</script>

<div class="form">
  <div class="section"><span class="section-label">new target on {spread.title}</span>
    <button type="button" class="text-link" onclick={oncancel}>cancel</button></div>
  <div class="row"><span class="label">title</span>
    <input class="field" bind:value={title} placeholder="what the entry is about" aria-label="Title" /></div>
  <div class="row"><span class="label">page</span>
    <span class="controls">
      <Segmented options={pages.map(String)} value={String(page)} labels={Object.fromEntries(pages.map(p => [String(p), pageLabel(p)]))} onchange={p => (page = Number(p))} />
      <select class="field" aria-label="Category" value={category} onchange={e => (category = (e.currentTarget as HTMLSelectElement).value as typeof category)}>
        {#each CATEGORIES as c (c)}<option value={c}>{c}</option>{/each}
      </select>
    </span></div>
  <div class="row"><span class="label">image</span>
    <span class="controls">
      <select class="field grow" aria-label="Printed image" value={imageUrl} onchange={e => (imageUrl = (e.currentTarget as HTMLSelectElement).value)}>
        <option value="">{images.length ? "from the library…" : "no image in the library yet"}</option>
        {#each images as asset (asset.id)}<option value={asset.url}>{asset.name}{asset.width ? ` · ${asset.width}×${asset.height}` : ""}</option>{/each}
      </select>
      <button type="button" class="pill framed" onclick={() => fileInput?.click()}>Upload…</button>
      <input bind:this={fileInput} type="file" accept={ACCEPT.split(",").filter(e => /jpe?g|png|webp/.test(e)).join(",")} hidden
        onchange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void upload(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
    </span></div>
  {#if imageUrl}<div class="row"><span class="label"></span><img class="preview" src={imageUrl} alt="" /></div>{/if}
  <div class="section"><span class="section-label">printed on the page (mm)</span></div>
  <div class="row"><span class="label">surface</span>
    <span class="controls"><Segmented options={surfaces} value={surface} onchange={s => (surface = s)} /></span></div>
  <div class="row"><span class="label">x · y</span>
    <span class="fields">
      <ScrubNumber value={x} min={0} max={230} step={1} fallback={40} prefix="X" unit="mm" label="x from the left" oninput={v => (x = v)} />
      <ScrubNumber value={y} min={0} max={320} step={1} fallback={60} prefix="Y" unit="mm" label="y from the top" oninput={v => (y = v)} />
    </span></div>
  <div class="row"><span class="label">width</span>
    <span class="w"><ScrubNumber value={width} min={10} max={230} step={1} fallback={80} unit="mm" label="printed width" positive oninput={v => (width = v)} /></span></div>
  <div class="section"><span class="section-label">AR content (optional – more nodes in the Entity panel)</span></div>
  <div class="row"><span class="label">node</span>
    <span class="controls">
      <select class="field" aria-label="Node type" value={entityType} onchange={e => { entityType = (e.currentTarget as HTMLSelectElement).value as EntityType | ""; entityFile = ""; }}>
        {#each ENTITY_TYPES as t (t)}<option value={t}>{t || "none"}</option>{/each}
      </select>
      {#if entityType && NODE_ASSET_KINDS[entityType]}
        <select class="field grow" aria-label="Node file" value={entityFile} onchange={e => (entityFile = (e.currentTarget as HTMLSelectElement).value)}>
          <option value="">{entityFiles.length ? "from the library…" : `no ${entityType} file in the library yet`}</option>
          {#each entityFiles as asset (asset.id)}<option value={asset.url}>{asset.name}</option>{/each}
        </select>
        <button type="button" class="pill framed" onclick={() => entityInput?.click()}>Upload…</button>
        <input bind:this={entityInput} type="file" accept={ACCEPT} hidden onchange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void uploadForEntity(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
      {/if}
    </span></div>
  {#if entityType === "text"}
    <div class="row"><span class="label">text</span><input class="field" bind:value={entityText} aria-label="Text" /></div>
  {/if}
  <div class="actions">
    <span class="grow"></span>
    {#if library.uploading.length}<span class="small muted">uploading…</span>{/if}
    {#if error}<span class="small danger">{error}</span>{/if}
    <button type="button" class="pill primary" disabled={busy || !title.trim() || !imageUrl || !entityReady} onclick={create}>{busy ? "Creating…" : "Create target"}</button>
  </div>
</div>

<style>
  .form { display: flex; flex-direction: column; gap: .125rem; }
  .row > .field { width: 100%; }
  .controls .grow { flex: 1; min-width: 6rem; }
  .preview { max-width: 8rem; max-height: 6rem; border: 1px solid var(--line); border-radius: var(--control-radius); object-fit: contain; }
  .fields :global(.scrub) { width: 100%; }
  .w { width: 7rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
