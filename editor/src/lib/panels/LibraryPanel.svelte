<script lang="ts">
  import { ApiError, type Asset } from "$lib/api";
  import { ACCEPT, library, NODE_ASSET_KINDS } from "$lib/library.svelte";
  import { assetPlace, LIBRARY_VIEWS, matchesSearch, readLibraryView, saveLibraryView, type LibraryView } from "$lib/library-place";
  import Icon from "$lib/components/Icon.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import AssetThumb from "./AssetThumb.svelte";
  import { fitsSlot, type EnvironmentSlot } from "$lib/environment.svelte";

  /**
   * The book's library: the files uploaded in the editor and, after them, the files of the content import (`files.json`,
   * read-only – docs/server.md "Assets"). A grid of cards – a preview (`AssetThumb`: images, a video's poster that
   * plays) – with where the file belongs (`p015-1 · target`, `assetPlace`), kind, size, dimensions and the number of
   * uses, or a plain list of the same (a click on a row opens its actions; the view is remembered per browser); filter by kind, search name and place;
   * **Upload** (the button, or files dropped anywhere on the panel); per asset **Use** (the selected node takes the
   * file, when its type fits; an image can also become the selected target's printed image), **Replace…** (a new
   * version, every use relinked) and **Delete** (refused while used – *Delete anyway* forces it). While the Environment
   * tab picks a file (`environmentSlot`), a fitting asset has a **World** / **Sky** button and the kind filter starts there.
   */
  let { bookId, nodeType, targetId, onuse, onusetarget, onchanged, environmentSlot = null, onuseenvironment }: {
    bookId: string;
    /** The selected node's type (its file kind) – null without a node */
    nodeType: string | null;
    /** The selected target (an image may become its printed image) */
    targetId: string | null;
    /** The selected node takes this asset */
    onuse: (asset: Asset) => void;
    /** The selected target's printed image becomes this asset */
    onusetarget: (asset: Asset) => Promise<void>;
    /** A replace changed the draft (uses relinked): the content should reload */
    onchanged: () => Promise<void>;
    /** The environment's file being picked (the Environment tab's *Library…*), null = none */
    environmentSlot?: EnvironmentSlot | null;
    /** The environment takes this asset for the slot */
    onuseenvironment?: (slot: EnvironmentSlot, asset: Asset) => void;
  } = $props();

  const KINDS = ["all", "model", "video", "image", "audio"] as const;
  type KindFilter = (typeof KINDS)[number];
  let kind = $state<KindFilter>("all");
  // Picking for the environment: the kind that fits first
  $effect(() => {
    if (environmentSlot) kind = environmentSlot === "world" ? "model" : "image";
  });
  let search = $state("");
  let fileInput = $state<HTMLInputElement>();
  let replaceInput = $state<HTMLInputElement>();
  let replacing = $state<Asset | null>(null);
  let confirming = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let dragging = $state(false);
  let view = $state<LibraryView>(readLibraryView());
  /** The list's row whose actions are open */
  let opened = $state<string | null>(null);
  const setView = (next: LibraryView) => {
    view = next;
    saveLibraryView(next);
  };

  $effect(() => {
    if (library.bookId !== bookId) void library.load(bookId);
  });

  const KIND_OF: Record<string, readonly string[]> = { model: ["glb", "gltf"], video: ["video"], image: ["image"], audio: ["audio"] };
  const shown = $derived(library.assets.filter(asset =>
    (kind === "all" || KIND_OF[kind]?.includes(asset.kind)) && matchesSearch(asset, search)));
  const fits = (asset: Asset) => !!nodeType && (NODE_ASSET_KINDS[nodeType] ?? []).includes(asset.kind);
  const size = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`);

  const uploadFiles = async (files: FileList | File[]) => {
    notice = null;
    for (const file of Array.from(files)) {
      try {
        await library.upload(bookId, file);
      } catch {
        // library.error says
      }
    }
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    dragging = false;
    if (event.dataTransfer?.files.length) void uploadFiles(event.dataTransfer.files);
  };
  const startReplace = (asset: Asset) => {
    replacing = asset;
    replaceInput?.click();
  };
  const doReplace = async (file: File) => {
    const asset = replacing;
    replacing = null;
    if (!asset) return;
    try {
      const next = await library.replace(bookId, asset.id, file);
      notice = `${next.name} is version ${next.version}; ${next.usages} use${next.usages === 1 ? "" : "s"} relinked`;
      await onchanged();
    } catch {
      // library.error says
    }
  };
  const remove = async (asset: Asset, force: boolean) => {
    try {
      await library.remove(bookId, asset.id, force);
      confirming = null;
      notice = `${asset.name} deleted`;
    } catch (e) {
      if (e instanceof ApiError && e.code === "asset-in-use") confirming = asset.id;
      else library.error = e instanceof ApiError ? e.message : String(e);
    }
  };
</script>

{#snippet actions(asset: Asset)}
  {#if environmentSlot && fitsSlot(asset, environmentSlot)}
    <button type="button" class="pill primary" title={environmentSlot === "world" ? "The world around the reader" : "The sky of the world around the reader"}
      onclick={() => onuseenvironment?.(environmentSlot, asset)}>{environmentSlot === "world" ? "World" : "Sky"}</button>
  {/if}
  <button type="button" class="pill" disabled={!fits(asset)} title={fits(asset) ? "The selected node takes this file" : nodeType ? `A ${nodeType} node takes no ${asset.kind}` : "Select a node first"} onclick={() => onuse(asset)}>Use</button>
  {#if asset.kind === "image" && targetId}
    <button type="button" class="pill" title="The selected target's printed image" onclick={() => void onusetarget(asset)}>Target image</button>
  {/if}
  {#if asset.imported}
    <span class="small muted" title="From the content import – replaced by the next import, not here">imported</span>
  {:else}
    <button type="button" class="text-link" onclick={() => startReplace(asset)}>Replace…</button>
    {#if confirming === asset.id}
      <span class="small danger">in use –</span>
      <button type="button" class="text-link danger" onclick={() => void remove(asset, true)}>Delete anyway</button>
      <button type="button" class="text-link" onclick={() => (confirming = null)}>keep</button>
    {:else}
      <button type="button" class="text-link" onclick={() => void remove(asset, false)}>Delete</button>
    {/if}
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="library" class:dragging ondragover={e => { e.preventDefault(); dragging = true; }} ondragleave={() => (dragging = false)} ondrop={onDrop}>
  {#if environmentSlot}
    <div class="row"><span class="small muted">Picking the environment's {environmentSlot === "world" ? "world – a glTF model" : "sky – an equirectangular jpg, png or webp"}: its <b>{environmentSlot === "world" ? "World" : "Sky"}</b> button takes it.</span></div>
  {/if}
  <div class="row"><span class="label">kind</span>
    <span class="controls"><Segmented options={KINDS} value={kind} onchange={k => (kind = k)} /></span></div>
  <div class="row"><span class="label">search</span>
    <span class="controls">
      <input class="field grow" placeholder="name or entry" bind:value={search} aria-label="Search the library" />
      <button type="button" class="pill framed" onclick={() => fileInput?.click()}><Icon name="plus" /> Upload</button>
      <input bind:this={fileInput} type="file" accept={ACCEPT} multiple hidden onchange={e => { const f = (e.currentTarget as HTMLInputElement).files; if (f?.length) void uploadFiles(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
      <input bind:this={replaceInput} type="file" accept={ACCEPT} hidden onchange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void doReplace(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
    </span></div>
  <div class="row"><span class="label">view</span>
    <span class="controls"><Segmented options={LIBRARY_VIEWS} value={view} titles={{ cards: "Cards with previews", list: "A plain list" }} onchange={setView} /></span></div>
  {#if library.uploading.length}<p class="small muted">uploading {library.uploading.join(", ")}…</p>{/if}
  {#if library.error}<p class="small danger">{library.error}</p>{/if}
  {#if notice}<p class="small muted">{notice}</p>{/if}

  {#if library.loading && !library.assets.length}
    <p class="muted small">Loading…</p>
  {:else if !shown.length}
    <p class="muted small">{library.assets.length ? "Nothing matches." : "No files yet – upload a model (glb), a video, an image or a sound, or drop it here."}</p>
  {:else if view === "list"}
    <table class="list">
      <thead><tr><th>name</th><th>place</th><th>kind</th><th class="num">size</th><th class="num">uses</th></tr></thead>
      <tbody>
        {#each shown as asset (asset.id)}
          {@const place = assetPlace(asset)}
          <tr class:on={opened === asset.id} onclick={() => (opened = opened === asset.id ? null : asset.id)}>
            <td class="name" title={asset.url}><button type="button" class="open" aria-expanded={opened === asset.id}>{asset.name}</button>{#if asset.version > 1} <span class="muted">v{asset.version}</span>{/if}</td>
            <td class="name" title={place.place ?? ""}>{place.place ?? "upload"}</td>
            <td class="muted">{asset.kind}</td>
            <td class="num muted">{size(asset.size)}</td>
            <td class="num muted">{asset.usages}</td>
          </tr>
          {#if opened === asset.id}
            <tr class="more"><td colspan="5"><div class="actions">{@render actions(asset)}</div></td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {:else}
    <ul class="grid">
      {#each shown as asset (asset.id)}
        {@const place = assetPlace(asset)}
        <li class="card">
          {#key asset.url}<AssetThumb {asset} />{/key}
          <div class="name" title={asset.url}>{place.label}{#if asset.version > 1} <span class="muted">v{asset.version}</span>{/if}</div>
          <div class="small muted">{asset.kind} · {size(asset.size)}{#if asset.width} · {asset.width}×{asset.height}{/if} · {asset.usages} use{asset.usages === 1 ? "" : "s"}</div>
          <div class="actions">{@render actions(asset)}</div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .library { display: flex; flex-direction: column; gap: .125rem; min-height: 100%; }
  .library.dragging { outline: 1px dashed var(--text); outline-offset: -2px; }
  .controls .grow { flex: 1; min-width: 6rem; }
  .grid { list-style: none; margin: .375rem 0 0; padding: 0; display: grid; gap: .5rem; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); }
  .card { display: flex; flex-direction: column; gap: .2rem; padding: .375rem; border: 1px solid var(--line); border-radius: var(--control-radius); min-width: 0; }
  .list { width: 100%; margin-top: .375rem; border-collapse: collapse; table-layout: fixed; }
  .list th { text-align: left; font-weight: normal; color: var(--muted); font-size: var(--text-small); }
  .list th, .list td { padding: .2rem .25rem; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .list th:nth-child(1), .list th:nth-child(2) { width: 30%; }
  .list th:nth-child(3) { width: 14%; }
  .list th:nth-child(4) { width: 16%; }
  .list th:nth-child(5) { width: 10%; }
  .list tbody tr { cursor: pointer; }
  .list tbody tr:hover, .list tr.on { background: var(--hover-background); }
  .list tr.on td { border-bottom-color: transparent; }
  .list tr.more { cursor: default; background: var(--hover-background); }
  .list .num { text-align: right; white-space: nowrap; }
  .list .actions { margin: 0; }
  .open { all: unset; cursor: pointer; }
  .open:focus-visible { outline: 1px solid var(--text); }
  .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .5rem; margin-top: .125rem; }
  .actions .pill { padding: 0 .5rem; height: 1.5rem; border-color: var(--line); }
  .text-link.danger { color: var(--danger); }
</style>
