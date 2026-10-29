<script lang="ts">
  import { untrack } from "svelte";
  import { content } from "$lib/content.svelte";
  import { plugins } from "$lib/plugins.svelte";
  import { NEW_PLUGIN_SOURCE } from "$lib/plugins/compile";
  import type { Stage } from "$lib/stage/stage.svelte";
  import Icon from "$lib/components/Icon.svelte";

  /**
   * The **Code** tab: the book's own code (agents/research/2026-10-29-code-in-the-editor.md). The plugins stored for
   * the book and the ones the content declares (compiled by the content build), one open in a plain code editor (a
   * textarea with a line gutter – Tab indents, Ctrl+Enter runs, Ctrl+S saves). **Run** transpiles the TypeScript in
   * the browser and installs the module in the stage's registry, so a layer or component shows on the stage and in
   * the Entity panel at once; **Save** stores the source; errors show under the editor with their line. Nothing run
   * here reaches readers: a plugin gets there as a folder of the content source (**Download**), through the build.
   */
  let { bookId, stage }: { bookId: string; stage: Stage | null } = $props();

  const PLUGIN_ID = /^[a-z][a-z0-9-]{0,39}$/;

  let open = $state<string | null>(null);
  let source = $state("");
  /** The source as loaded or last saved (dirty = differs) */
  let saved = $state("");
  let loadingSource = $state(false);
  let saving = $state(false);
  let notice = $state<string | null>(null);
  let newId = $state("");
  let adding = $state(false);
  let confirmingDelete = $state(false);
  let textarea = $state<HTMLTextAreaElement>();
  let gutter = $state<HTMLElement>();

  $effect(() => {
    if (plugins.bookId !== bookId) void plugins.load(bookId);
  });

  // The plugins the content declares (compiled by the build) follow the content; the stored ones the API
  const declared = $derived.by(() => { void content.hash; return plugins.declared(); });
  const storedIds = $derived(plugins.stored.map(p => p.id));
  /** Every plugin shown: stored sources first, then declared ones without a stored source */
  const shown = $derived([
    ...plugins.stored.map(p => ({ id: p.id, stored: true, declared: declared.some(d => d.id === p.id), size: p.size })),
    ...declared.filter(d => !storedIds.includes(d.id)).map(d => ({ id: d.id, stored: false, declared: true, size: 0 })),
  ]);
  const dirty = $derived(source !== saved);
  const lines = $derived(Math.max(1, source.split("\n").length));
  const current = $derived(shown.find(p => p.id === open));

  // The first plugin opens by itself
  $effect(() => {
    const first = shown[0]?.id;
    if (open === null && first && !untrack(() => adding)) void openPlugin(first);
  });

  const openPlugin = async (id: string) => {
    if (dirty && !window.confirm("Discard the unsaved changes?")) return;
    open = id;
    adding = false;
    notice = null;
    confirmingDelete = false;
    loadingSource = true;
    try {
      const stored = storedIds.includes(id);
      const text = stored ? await plugins.source(bookId, id) : await plugins.declaredSource(declared.find(d => d.id === id)!.src);
      source = text;
      saved = stored ? text : "";
      if (!stored) notice = "compiled by the content build – Save keeps a copy of its source here";
    } catch (e) {
      source = "";
      saved = "";
      notice = `The source could not be read: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      loadingSource = false;
    }
  };

  const startNew = () => {
    if (dirty && !window.confirm("Discard the unsaved changes?")) return;
    adding = true;
    open = null;
    newId = "";
    source = NEW_PLUGIN_SOURCE;
    saved = "";
    notice = null;
  };
  const newIdOk = $derived(PLUGIN_ID.test(newId) && !shown.some(p => p.id === newId));

  const save = async () => {
    const id = adding ? newId : open;
    if (!id || (adding && !newIdOk)) return;
    saving = true;
    notice = null;
    try {
      await plugins.save(bookId, id, source);
      saved = source;
      open = id;
      adding = false;
      notice = `saved ${id}`;
    } catch {
      // plugins.error says
    } finally {
      saving = false;
    }
  };

  const run = async () => {
    const id = adding ? (newIdOk ? newId : "draft") : open;
    if (!id) return;
    notice = null;
    const ok = await plugins.run(id, source, stage);
    if (ok) notice = `ran ${id}${plugins.lastRun?.types.length ? ` – registered ${plugins.lastRun.types.join(", ")}` : ""}`;
  };

  const remove = async () => {
    if (!open || !current?.stored) return;
    try {
      await plugins.remove(bookId, open);
      confirmingDelete = false;
      notice = `${open} deleted`;
      open = null;
      source = "";
      saved = "";
    } catch (e) {
      plugins.error = e instanceof Error ? e.message : String(e);
    }
  };

  /** The source as a file for the content source: plugins/<id>/index.ts */
  const download = () => {
    const id = adding ? newId || "plugin" : open;
    const url = URL.createObjectURL(new Blob([source], { type: "text/typescript" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.index.ts`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const el = event.currentTarget as HTMLTextAreaElement;
      const { selectionStart, selectionEnd } = el;
      source = `${source.slice(0, selectionStart)}  ${source.slice(selectionEnd)}`;
      requestAnimationFrame(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2));
    } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void run();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
    }
  };
  const syncScroll = () => {
    if (gutter && textarea) gutter.scrollTop = textarea.scrollTop;
  };
  const errorLine = $derived(plugins.runError?.line ?? null);
</script>

<div class="row"><span class="label">plugin</span>
  <span class="controls">
    <select class="field grow" aria-label="Plugin" value={adding ? "" : open ?? ""} onchange={e => { const id = (e.currentTarget as HTMLSelectElement).value; if (id) void openPlugin(id); }}>
      {#if !shown.length}<option value="">{plugins.loading ? "loading…" : "no plugin yet"}</option>{/if}
      {#if adding}<option value="">new plugin</option>{/if}
      {#each shown as p (p.id)}
        <option value={p.id}>{p.id}{p.declared ? " · in the content" : ""}{p.stored ? "" : " · not stored"}</option>
      {/each}
    </select>
    <button type="button" class="icon-button framed" title="New plugin" aria-label="New plugin" onclick={startNew}><Icon name="plus" /></button>
  </span></div>
{#if adding}
  <div class="row"><span class="label">id</span>
    <span class="controls">
      <input class="field grow" placeholder="tint" spellcheck="false" bind:value={newId} aria-label="Plugin id" />
      <span class="small muted">a folder name: letters, digits, -</span>
    </span></div>
{/if}

<div class="editor" class:has-error={errorLine !== null}>
  <pre class="gutter" bind:this={gutter} aria-hidden="true">{#each { length: lines } as _, i (i)}<span class="ln" class:error={errorLine === i + 1}>{i + 1}</span>{/each}</pre>
  <textarea bind:this={textarea} class="source" bind:value={source} spellcheck="false" wrap="off" aria-label="Plugin source (TypeScript)" disabled={loadingSource || (!open && !adding)}
    onkeydown={onKey} onscroll={syncScroll} oninput={() => { if (plugins.runError) plugins.runError = null; }}></textarea>
</div>

{#if plugins.runError}
  <p class="small danger message">{plugins.runError.line !== null ? `line ${plugins.runError.line}: ` : ""}{plugins.runError.message}</p>
{:else if plugins.error}
  <p class="small danger message">{plugins.error}</p>
{:else if notice}
  <p class="small muted message">{notice}</p>
{:else}
  <p class="small muted message">Run shows it on the stage (Ctrl+Enter); Save stores the source (Ctrl+S). Readers get a plugin through the content source: Download → plugins/&lt;id&gt;/index.ts → the content build.</p>
{/if}

<div class="actions">
  <button type="button" class="text-link" onclick={download} disabled={!source}>Download</button>
  {#if current?.stored}
    {#if confirmingDelete}
      <button type="button" class="text-link danger" onclick={remove}>Delete {open}</button>
      <button type="button" class="text-link" onclick={() => (confirmingDelete = false)}>keep</button>
    {:else}
      <button type="button" class="text-link" onclick={() => (confirmingDelete = true)}>Delete</button>
    {/if}
  {/if}
  <span class="grow"></span>
  <button type="button" class="pill framed" onclick={run} disabled={plugins.running || !source || (!open && !adding)} title="Transpile in the browser and run it on the stage (Ctrl+Enter)">{plugins.running ? "Running…" : "Run"}</button>
  <button type="button" class="pill primary" onclick={save} disabled={saving || !dirty || (adding && !newIdOk)} title="Store the source (Ctrl+S)">{saving ? "Saving…" : "Save"}</button>
</div>

<style>
  .controls .grow { flex: 1; min-width: 6rem; }
  /* The editor takes the panel's remaining height; its lines scroll inside it (the actions stay in reach) */
  .editor { flex: 1 1 0; min-height: 10rem; display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); margin-top: .25rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--control-background); overflow: hidden; }
  .editor.has-error { border-color: var(--danger); }
  .gutter, .source { min-height: 0; margin: 0; padding: .375rem 0; font: var(--text-small)/1.5 ui-monospace, Consolas, "SF Mono", monospace; tab-size: 2; }
  .gutter { display: flex; flex-direction: column; padding-left: .5rem; padding-right: .5rem; border-right: 1px solid var(--line); color: var(--muted); text-align: right; user-select: none; overflow: hidden; }
  .ln.error { color: var(--danger); font-weight: 600; }
  .source { padding-left: .5rem; padding-right: .5rem; border: none; outline: none; resize: none; background: none; color: var(--text); white-space: pre; overflow: auto; }
  .source:disabled { color: var(--muted); }
  .message { margin: .25rem 0 0; overflow-wrap: anywhere; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .375rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
  .text-link.danger { color: var(--danger); }
</style>
