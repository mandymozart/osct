<script lang="ts">
  import { ApiError, errorText, type Asset } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import { codeKindOf, codeUploadProblem, pluginIdFrom } from "#lib/library-code.js";
  import { ACCEPT, library } from "#lib/library.svelte.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { assetPlace, formatDuration, formatSize, LIBRARY_VIEWS, matchesSearch, readLibraryView, saveLibraryView, type LibraryView } from "#lib/library-place.js";
  import {
    FILTER_LABELS, LIBRARY_FILTERS, matchesFilter, nodeAssetKinds, pickAccept, pickFilter, pickFits, targetImagesOf, type LibraryFilter, type LibraryPick,
  } from "#lib/library-pick.js";
  import Icon from "#lib/components/Icon.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import AssetThumb from "./AssetThumb.svelte";
  import CodeFiles from "./CodeFiles.svelte";

  /**
   * The book's library: the files uploaded in the editor and, after them, the files of the content import (`files.json`,
   * read-only – docs/server.md "Assets"). A grid of cards – a preview (`AssetThumb`: images, a video's poster that
   * plays) – with where the file belongs (`p015-1 · target`, `assetPlace`), kind, size, dimensions, a video's duration and the number of
   * uses, or a plain list of the same (a click on a row opens its actions; the view is remembered per browser); filter
   * by kind – target images apart from the other images –, search name and place; **Upload** (the button, or files
   * dropped anywhere on the panel). Opened from the tab: per asset **Use** (the selected node takes the file, when its
   * type fits), **Target image** (the selected target's printed image), **Replace…** (a new version, every use
   * relinked) and **Delete** (refused while used – *Delete anyway* forces it). Opened as a **picker** (`pick`, a file
   * field's *Library…* – #164): the filter starts at the kind being picked, a click on a fitting file picks it for that
   * one field and returns, an upload that fits is picked at once; *cancel* or Esc returns without one.
   * **Code files** (#186) – scripts (the book's plugin sources) and shaders – are a list of their own under the media
   * (`CodeFiles`, the filter *code* shows it alone): an uploaded or dropped `.ts` / `.js` becomes a plugin source named
   * after the file, a `.glsl` / `.frag` / `.vert` / `.wgsl` a shader asset.
   */
  let { bookId, pick = null, nodeType = null, targetId = null, onuse, onusetarget, onchanged, onopencode }: {
    bookId: string;
    /** Opened as a picker for one field */
    pick?: LibraryPick | null;
    /** The selected node's type (its file kind) – null without a node */
    nodeType?: string | null;
    /** The selected target (an image may become its printed image) */
    targetId?: string | null;
    /** The selected node takes this asset */
    onuse?: (asset: Asset) => void;
    /** The selected target's printed image becomes this asset */
    onusetarget?: (asset: Asset) => Promise<void>;
    /** A replace changed the draft (uses relinked): the content should reload */
    onchanged?: () => Promise<void>;
    /** Show the Code tab (a script of the code list is in `plugins.focus`) */
    onopencode?: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let filter = $state<LibraryFilter>(pick ? pickFilter(pick.subject) : "all");
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

  const targetImages = $derived(targetImagesOf(content.spreads));
  /** The media shown (the shaders are in the code list) */
  const shown = $derived(library.assets.filter(asset => asset.kind !== "shader" && matchesFilter(asset, filter, targetImages) && matchesSearch(asset, search)));
  /** Scripts uploading (they become plugin sources), by file name */
  let scriptUploads = $state<string[]>([]);
  const uploading = $derived([...library.uploading, ...scriptUploads]);
  const fits = (asset: Asset) => {
    void plugins.version;
    return !!nodeType && (nodeAssetKinds(nodeType) ?? []).includes(asset.kind);
  };
  const pickable = (asset: Asset) => !!pick && pickFits(pick.subject, asset);

  const choose = (asset: Asset) => {
    if (pick && pickFits(pick.subject, asset)) void pick.onpick(asset);
  };
  /** A click on a card or a row while picking: a fitting file is picked (its own buttons – a video's play – stay theirs) */
  const pickFrom = (event: MouseEvent, asset: Asset) => {
    if (!(event.target as Element).closest("button, a, video")) choose(asset);
  };

  /** A script file becomes a plugin source named after it (an id taken: the code list's Replace… is the way) */
  const uploadScript = async (file: File) => {
    scriptUploads = [...scriptUploads, file.name];
    try {
      const plugin = await plugins.upload(bookId, file);
      notice = `${file.name} is the plugin ${plugin.id} – open it in the Code tab from the code list`;
      void plugins.load(bookId);
    } catch (e) {
      library.error = e instanceof ApiError && e.code === "plugin-exists"
        ? `${file.name}: the plugin ${pluginIdFrom(file.name)} exists – Replace… it in the code list`
        : `${file.name}: ${errorText(e)}`;
    } finally {
      scriptUploads = scriptUploads.filter(name => name !== file.name);
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    notice = null;
    for (const file of Array.from(files)) {
      const problem = codeUploadProblem(file);
      if (problem) {
        library.error = problem;
        continue;
      }
      if (codeKindOf(file.name) === "script") {
        if (pick) notice = `${file.name} does not fit ${pick.label}`;
        else await uploadScript(file);
        continue;
      }
      try {
        const asset = await library.upload(bookId, file);
        // Picking: the first upload that fits is the pick
        if (pick) {
          if (pickFits(pick.subject, asset)) return choose(asset);
          notice = `${asset.name} does not fit ${pick.label} – it stays in the Library`;
        }
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
      await onchanged?.();
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
      else library.error = errorText(e);
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (pick && event.key === "Escape" && !event.defaultPrevented) pick.oncancel();
  };
</script>

{#snippet actions(asset: Asset)}
  {#if pick}
    {#if pickable(asset)}
      <button type="button" class="pill" class:primary={pick.current !== asset.url} class:on={pick.current === asset.url}
        title={pick.current === asset.url ? `Chosen now for ${pick.label}` : `Take this file for ${pick.label}`} onclick={() => choose(asset)}>{pick.current === asset.url ? "Chosen" : "Pick"}</button>
    {:else}
      <span class="small muted">does not fit</span>
    {/if}
  {:else}
    <button type="button" class="pill" disabled={!fits(asset)} title={fits(asset) ? `The selected ${nodeType} node takes this file` : nodeType ? `A ${nodeType} node takes no ${asset.kind}` : "Select a node first"} onclick={() => onuse?.(asset)}>Use</button>
    {#if asset.kind === "image" && targetId && onusetarget}
      <button type="button" class="pill" title="Becomes the printed image of the target {targetId}" onclick={() => void onusetarget(asset)}>Target image</button>
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
  {/if}
{/snippet}

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="library" class:dragging ondragover={e => { e.preventDefault(); dragging = true; }} ondragleave={() => (dragging = false)} ondrop={onDrop}>
  {#if pick}
    <div class="section"><span class="section-label">library · {pick.label}</span>
      <button type="button" class="text-link" title="Back without a file (Esc)" onclick={pick.oncancel}>cancel</button></div>
  {/if}
  <div class="row"><span class="label">kind</span>
    <span class="controls"><Segmented options={LIBRARY_FILTERS} value={filter} labels={FILTER_LABELS}
      titles={{ target: "Pictures printed in the book: used as a target's image, or the import's target of an entry", image: "Images that are no target image" }}
      onchange={f => (filter = f)} /></span></div>
  <div class="row"><span class="label">search</span>
    <span class="controls">
      <input class="field grow" placeholder="name or entry" bind:value={search} aria-label="Search the library" />
      <button type="button" class="pill framed" data-help-name="Upload" data-help="Upload a model (glb), a video, an image or a sound, a shader (glsl, frag, vert, wgsl) or a script (ts, js – it becomes a plugin source named after the file) – or drop files on the library. Code files are at most 256 KB. While picking, an upload that fits is the pick." onclick={() => fileInput?.click()}><Icon name="plus" /> Upload</button>
      <input bind:this={fileInput} type="file" accept={pick ? pickAccept(pick.subject) : ACCEPT} multiple={!pick} hidden onchange={e => { const f = (e.currentTarget as HTMLInputElement).files; if (f?.length) void uploadFiles(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
      <input bind:this={replaceInput} type="file" accept={ACCEPT} hidden onchange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void doReplace(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
    </span></div>
  <div class="row"><span class="label">view</span>
    <span class="controls"><Segmented options={LIBRARY_VIEWS} value={view} titles={{ cards: "Cards with previews", list: "A plain list" }} onchange={setView} /></span></div>
  {#if dragging}<p class="drop small" aria-live="polite">drop to upload – media, shaders, scripts</p>{/if}
  {#if uploading.length}<p class="small muted">uploading {uploading.join(", ")}…</p>{/if}
  {#if library.error}<p class="small danger">{library.error}</p>{/if}
  {#if notice}<p class="small muted">{notice}</p>{/if}

  {#if filter === "code"}
    <!-- the code list alone -->
  {:else if library.loading && !library.assets.length}
    <p class="muted small">Loading…</p>
  {:else if !shown.length}
    <p class="muted small">{library.assets.some(asset => asset.kind !== "shader") ? "Nothing matches." : "No media yet."}</p>
  {:else if view === "list"}
    <table class="list">
      <thead><tr><th>name</th><th>place</th><th>kind</th><th class="num">size</th><th class="num">uses</th></tr></thead>
      <tbody>
        {#each shown as asset (asset.id)}
          {@const place = assetPlace(asset)}
          <tr class:on={opened === asset.id || (!!pick && pick.current === asset.url)} class:unfit={!!pick && !pickable(asset)}
            onclick={e => (pick ? pickFrom(e, asset) : (opened = opened === asset.id ? null : asset.id))}>
            <td class="name" title={asset.url}>{#if pick}<button type="button" class="open" disabled={!pickable(asset)} onclick={() => choose(asset)}>{asset.name}</button>{:else}<button type="button" class="open" aria-expanded={opened === asset.id}>{asset.name}</button>{/if}{#if asset.version > 1} <span class="muted">v{asset.version}</span>{/if}</td>
            <td class="name place" title={place.place ?? ""}>{place.place ?? "upload"}</td>
            <td class="muted kind">{asset.kind}</td>
            <td class="num muted size">{formatSize(asset.size)}</td>
            <td class="num muted uses">{asset.usages}<span class="unit"> use{asset.usages === 1 ? "" : "s"}</span></td>
          </tr>
          {#if opened === asset.id && !pick}
            <tr class="more"><td colspan="5"><div class="actions">{@render actions(asset)}</div></td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {:else}
    <ul class="grid">
      {#each shown as asset (asset.id)}
        {@const place = assetPlace(asset)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (the Pick button is the keyboard's way) -->
        <li class="card" class:picking={!!pick} class:current={!!pick && pick.current === asset.url} class:unfit={!!pick && !pickable(asset)}
          onclick={pick ? e => pickFrom(e, asset) : undefined}>
          {#key asset.url}<AssetThumb {asset} />{/key}
          <div class="name" title={asset.url}>{place.label}{#if asset.version > 1} <span class="muted">v{asset.version}</span>{/if}</div>
          <div class="small muted">{asset.kind} · {formatSize(asset.size)}{#if asset.width} · {asset.width}×{asset.height}{/if}{#if asset.durationMs} · {formatDuration(asset.durationMs)}{/if} · {asset.usages} use{asset.usages === 1 ? "" : "s"}</div>
          <div class="actions">{@render actions(asset)}</div>
        </li>
      {/each}
    </ul>
  {/if}
  {#if !pick && (filter === "all" || filter === "code")}
    <CodeFiles {bookId} {search} all={filter === "all"} {onopencode} />
  {/if}
</div>

<style>
  .library { position: relative; display: flex; flex-direction: column; gap: .125rem; min-height: 100%; container: library / inline-size; }
  .library.dragging { outline: 1px dashed var(--text); outline-offset: -2px; }
  /* No pointer on the drop hint: a hint under the cursor would end the drag */
  .drop { position: absolute; inset: .25rem; z-index: 1; margin: 0; display: flex; align-items: center; justify-content: center; text-align: center;
    pointer-events: none; background: var(--surface); opacity: .92; border-radius: var(--control-radius); }
  .controls .grow { flex: 1; min-width: 6rem; }
  .grid { list-style: none; margin: .375rem 0 0; padding: 0; display: grid; gap: .5rem; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); }
  .card { display: flex; flex-direction: column; gap: .2rem; padding: .375rem; border: 1px solid var(--line); border-radius: var(--control-radius); min-width: 0; }
  .card.picking:not(.unfit) { cursor: pointer; }
  @media (hover: hover) {
    .card.picking:not(.unfit):hover { background: var(--hover-background); }
  }
  .card.current { border-color: var(--text); }
  .unfit { opacity: .45; }
  .list tbody tr.unfit { cursor: default; }
  .list { width: 100%; margin-top: .375rem; border-collapse: collapse; table-layout: fixed; }
  .list th { text-align: left; font-weight: normal; color: var(--muted); font-size: var(--text-small); }
  .list th, .list td { padding: .2rem .25rem; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .list th:nth-child(1), .list th:nth-child(2) { width: 30%; }
  .list th:nth-child(3) { width: 14%; }
  .list th:nth-child(4) { width: 16%; }
  .list th:nth-child(5) { width: 10%; }
  .list tbody tr { cursor: pointer; }
  @media (hover: hover) {
    .list tbody tr:hover { background: var(--hover-background); }
  }
  .list tr.on { background: var(--hover-background); }
  .list tr.on td { border-bottom-color: transparent; }
  .list tr.more { cursor: default; background: var(--hover-background); }
  .list .num { text-align: right; white-space: nowrap; }
  .list .actions { margin: 0; }
  .open { all: unset; cursor: pointer; }
  .open:focus-visible { outline: 1px solid var(--text); }
  .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .5rem; margin-top: .125rem; }
  .actions .pill { padding: 0 .5rem; height: 1.5rem; border-color: var(--line); }
  @media (pointer: coarse) { .actions .pill { height: var(--control-height); } }
  .text-link.danger { color: var(--danger); }
  .list .unit { display: none; }
  @container library (max-width: 26rem) {
    .list, .list tbody { display: block; }
    .list thead { display: none; }
    .list tbody tr { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "name name kind" "place size uses";
      column-gap: .75rem; row-gap: .125rem; align-items: baseline; min-height: 2.5rem; padding: .3rem .25rem; border-bottom: 1px solid var(--line); box-sizing: border-box; }
    .list tbody tr.on { border-bottom-color: transparent; }
    .list tbody tr.more { display: block; min-height: 0; padding: 0 .25rem .375rem; }
    .list th, .list td { padding: 0; border-bottom: none; }
    .list td { display: block; min-width: 0; }
    .list td:nth-child(1) { grid-area: name; }
    .list td.place { grid-area: place; font-size: var(--text-small); color: var(--muted); }
    .list td.kind { grid-area: kind; text-align: right; }
    .list td.size { grid-area: size; font-size: var(--text-small); }
    .list td.uses { grid-area: uses; font-size: var(--text-small); }
    .list .unit { display: inline; }
  }
  @container library (max-width: 20rem) {
    .controls .grow { min-width: 0; flex-basis: 5rem; }
  }
</style>
