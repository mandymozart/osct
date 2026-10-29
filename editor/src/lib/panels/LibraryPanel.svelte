<script lang="ts">
  import { ApiError, type Asset } from "$lib/api";
  import { ACCEPT, library, NODE_ASSET_KINDS } from "$lib/library.svelte";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import Segmented from "$lib/components/Segmented.svelte";

  /**
   * The book's library: the files uploaded in the editor (docs/server.md "Assets"). A grid of cards – a thumbnail for
   * images, the type's icon else – with name, kind, size, dimensions and the number of uses; filter by kind, search;
   * **Upload** (the button, or files dropped anywhere on the panel); per asset **Use** (the selected node takes the
   * file, when its type fits; an image can also become the selected target's printed image), **Replace…** (a new
   * version, every use relinked) and **Delete** (refused while used – *Delete anyway* forces it).
   */
  let { bookId, nodeType, targetId, onuse, onusetarget, onchanged }: {
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
  } = $props();

  const KINDS = ["all", "model", "video", "image", "audio"] as const;
  type KindFilter = (typeof KINDS)[number];
  let kind = $state<KindFilter>("all");
  let search = $state("");
  let fileInput = $state<HTMLInputElement>();
  let replaceInput = $state<HTMLInputElement>();
  let replacing = $state<Asset | null>(null);
  let confirming = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let dragging = $state(false);

  $effect(() => {
    if (library.bookId !== bookId) void library.load(bookId);
  });

  const KIND_OF: Record<string, readonly string[]> = { model: ["glb", "gltf"], video: ["video"], image: ["image"], audio: ["audio"] };
  const shown = $derived(library.assets.filter(asset =>
    (kind === "all" || KIND_OF[kind]?.includes(asset.kind)) && (!search.trim() || asset.name.toLowerCase().includes(search.trim().toLowerCase()))));
  const fits = (asset: Asset) => !!nodeType && (NODE_ASSET_KINDS[nodeType] ?? []).includes(asset.kind);
  const ICONS: Record<string, IconName> = { glb: "model", gltf: "model", video: "video", image: "image", audio: "layers" };
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="library" class:dragging ondragover={e => { e.preventDefault(); dragging = true; }} ondragleave={() => (dragging = false)} ondrop={onDrop}>
  <div class="row"><span class="label">kind</span>
    <span class="controls"><Segmented options={KINDS} value={kind} onchange={k => (kind = k)} /></span></div>
  <div class="row"><span class="label">search</span>
    <span class="controls">
      <input class="field grow" placeholder="file name" bind:value={search} aria-label="Search the library" />
      <button type="button" class="pill framed" onclick={() => fileInput?.click()}><Icon name="plus" /> Upload</button>
      <input bind:this={fileInput} type="file" accept={ACCEPT} multiple hidden onchange={e => { const f = (e.currentTarget as HTMLInputElement).files; if (f?.length) void uploadFiles(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
      <input bind:this={replaceInput} type="file" accept={ACCEPT} hidden onchange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void doReplace(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
    </span></div>
  {#if library.uploading.length}<p class="small muted">uploading {library.uploading.join(", ")}…</p>{/if}
  {#if library.error}<p class="small danger">{library.error}</p>{/if}
  {#if notice}<p class="small muted">{notice}</p>{/if}

  {#if library.loading && !library.assets.length}
    <p class="muted small">Loading…</p>
  {:else if !shown.length}
    <p class="muted small">{library.assets.length ? "Nothing matches." : "No files yet – upload a model (glb), a video, an image or a sound, or drop it here."}</p>
  {:else}
    <ul class="grid">
      {#each shown as asset (asset.id)}
        <li class="card">
          <div class="thumb">
            {#if asset.kind === "image"}<img src={asset.url} alt="" loading="lazy" decoding="async" />{:else}<Icon name={ICONS[asset.kind] ?? "layers"} size="1.75em" stroke={1.5} />{/if}
          </div>
          <div class="name" title={asset.name}>{asset.name}{#if asset.version > 1} <span class="muted">v{asset.version}</span>{/if}</div>
          <div class="small muted">{asset.kind} · {size(asset.size)}{#if asset.width} · {asset.width}×{asset.height}{/if} · {asset.usages} use{asset.usages === 1 ? "" : "s"}</div>
          <div class="actions">
            <button type="button" class="pill" disabled={!fits(asset)} title={fits(asset) ? "The selected node takes this file" : nodeType ? `A ${nodeType} node takes no ${asset.kind}` : "Select a node first"} onclick={() => onuse(asset)}>Use</button>
            {#if asset.kind === "image" && targetId}
              <button type="button" class="pill" title="The selected target's printed image" onclick={() => void onusetarget(asset)}>Target image</button>
            {/if}
            <button type="button" class="text-link" onclick={() => startReplace(asset)}>Replace…</button>
            {#if confirming === asset.id}
              <span class="small danger">in use –</span>
              <button type="button" class="text-link danger" onclick={() => void remove(asset, true)}>Delete anyway</button>
              <button type="button" class="text-link" onclick={() => (confirming = null)}>keep</button>
            {:else}
              <button type="button" class="text-link" onclick={() => void remove(asset, false)}>Delete</button>
            {/if}
          </div>
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
  .thumb { display: flex; align-items: center; justify-content: center; aspect-ratio: 4 / 3; background: var(--surface-head); border-radius: var(--control-radius); overflow: hidden; color: var(--muted); }
  .thumb img { width: 100%; height: 100%; object-fit: contain; }
  .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .5rem; margin-top: .125rem; }
  .actions .pill { padding: 0 .5rem; height: 1.5rem; border-color: var(--line); }
  .text-link.danger { color: var(--danger); }
</style>
