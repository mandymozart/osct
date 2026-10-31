<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { ApiError, errorText, type Usage } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import { usageText } from "#lib/library-code.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { NEW_PLUGIN_SOURCE } from "#lib/plugins/compile.js";
  import { downloadFiles, zipFiles } from "#lib/plugins/code-editor.js";
  import type { CodeEditor } from "#lib/plugins/monaco.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";

  /**
   * The **Code** tab: the book's own code (docs/plugins.md "Trying it: the Code tab"). The plugins stored for
   * the book and the ones the content declares (compiled by the content build), one open in Monaco (`plugins/monaco.ts`,
   * loaded with this tab only): TypeScript against the plugin API's types – completion and type errors inline as the
   * content build reports them; Tab indents, Ctrl+Enter runs, Ctrl+S saves. **Run** transpiles the TypeScript in
   * the browser and installs the module in the stage's registry, so a layer or component shows on the stage and in
   * the Inspector at once; **Save** stores the source; a Run's error shows under the editor and as a marker on its
   * line; **Download** gives the source with `plugin-api.d.ts` and a tsconfig, so it type-checks the same way
   * elsewhere. Nothing run
   * here reaches readers: a publish compiles the stored plugins with the content build (#78); until then only the
   * plugins of the content source are compiled. The Library lists the stored sources as its scripts and opens one here
   * (`plugins.focus`); **Delete** is refused while the draft uses what the plugin registers (*Delete anyway* forces it).
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
  /** The delete was refused: where the draft uses the plugin's types */
  let inUse = $state<string | null>(null);
  let host = $state<HTMLElement>();
  let code = $state<CodeEditor | null>(null);
  let codeError = $state<string | null>(null);

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
  const current = $derived(shown.find(p => p.id === open));

  // The Library's *Open in Code*: that plugin, once the list knows it
  $effect(() => {
    const focus = plugins.focus;
    if (!focus || !shown.some(p => p.id === focus)) return;
    untrack(() => {
      plugins.focus = null;
      if (open !== focus) void openPlugin(focus);
    });
  });

  // The first plugin opens by itself
  $effect(() => {
    const first = shown[0]?.id;
    if (open === null && first && !plugins.focus && !untrack(() => adding)) void openPlugin(first);
  });

  const openPlugin = async (id: string) => {
    if (dirty && !window.confirm("Discard the unsaved changes?")) return;
    open = id;
    adding = false;
    notice = null;
    confirmingDelete = false;
    inUse = null;
    loadingSource = true;
    try {
      const stored = storedIds.includes(id);
      const text = stored ? await plugins.source(bookId, id) : await plugins.declaredSource(declared.find(d => d.id === id)!.src);
      source = text;
      saved = stored ? text : "";
      code?.open(id, text);
      // A state, not an explanation – that Save keeps a copy is the Save button's help (RULES #32 – #170)
      if (!stored) notice = "compiled by the content build";
    } catch (e) {
      source = "";
      saved = "";
      code?.open(id, "");
      notice = `The source could not be read: ${errorText(e)}`;
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
    code?.open("", NEW_PLUGIN_SOURCE);
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

  const remove = async (force = false) => {
    if (!open || !current?.stored) return;
    try {
      await plugins.remove(bookId, open, force);
      confirmingDelete = false;
      inUse = null;
      notice = `${open} deleted`;
      open = null;
      source = "";
      saved = "";
      code?.open("", "");
    } catch (e) {
      if (e instanceof ApiError && e.code === "plugin-in-use") inUse = usageText((e.details.usages as Usage[] | undefined) ?? []);
      else plugins.error = errorText(e);
    }
  };

  const download = async () => {
    const id = adding ? newId || "plugin" : open;
    if (!id) return;
    const { default: pluginApi } = await import("#lib/plugins/plugin-api.d.ts?raw");
    const zip = zipFiles(downloadFiles(id, source, pluginApi));
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${id}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const readOnly = $derived(loadingSource || (!open && !adding));

  // Monaco comes with this tab (its own chunk); the panel works on `source`, the editor mirrors it
  onMount(() => {
    let disposed = false;
    let editor: CodeEditor | null = null;
    import("#lib/plugins/monaco.js").then(({ createCodeEditor }) => {
      if (disposed || !host) return;
      editor = createCodeEditor(host, {
        value: untrack(() => source),
        modelId: untrack(() => (adding ? "" : open ?? "")),
        readOnly: untrack(() => readOnly),
        onChange: value => {
          source = value;
          if (plugins.runError) plugins.runError = null;
        },
        onAction: action => void (action === "run" ? run() : save()),
      });
      code = editor;
    }).catch(e => { codeError = `The code editor could not be loaded: ${errorText(e)}`; });
    return () => {
      disposed = true;
      editor?.dispose();
      code = null;
    };
  });
  $effect(() => { code?.setReadOnly(readOnly); });
  $effect(() => { code?.setRunError(plugins.runError); });
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
    <button type="button" class="pill framed" title="New plugin" onclick={startNew}>new</button>
  </span></div>
{#if adding}
  <div class="row" data-help-name="Plugin id" data-help="The new plugin's folder name: letters, digits and -."><span class="label">id</span>
    <span class="controls">
      <input class="field grow" placeholder="tint" spellcheck="false" bind:value={newId} aria-label="Plugin id" />
    </span></div>
{/if}

<div class="editor" class:has-error={errorLine !== null} data-help-name="Plugin source" data-help="The plugin's TypeScript, checked against the plugin API as the content build checks it: completion with Ctrl+Space, type errors underlined. Run (Ctrl+Enter) shows it on the stage; Save (Ctrl+S) stores the source. Readers get a plugin with a publish once it compiles them (#78) – today only the content source's plugins are compiled.">
  <div class="monaco" bind:this={host}></div>
  {#if !code}<p class="small muted loading">{codeError ?? "loading the code editor…"}</p>{/if}
</div>

{#if plugins.runError}
  <p class="small danger message">{plugins.runError.line !== null ? `line ${plugins.runError.line}: ` : ""}{plugins.runError.message}</p>
{:else if plugins.error}
  <p class="small danger message">{plugins.error}</p>
{:else if notice}
  <p class="small muted message">{notice}</p>
{/if}

<div class="actions">
  {#if current?.stored}
    {#if inUse !== null}
      <span class="small danger in-use" title="Where the draft uses what the plugin registers">used by {inUse || "the draft"} –</span>
      <button type="button" class="text-link danger" onclick={() => void remove(true)}>Delete anyway</button>
      <button type="button" class="text-link" onclick={() => { inUse = null; confirmingDelete = false; }}>keep</button>
    {:else if confirmingDelete}
      <button type="button" class="text-link danger" onclick={() => void remove()}>Delete {open}</button>
      <button type="button" class="text-link" onclick={() => (confirmingDelete = false)}>keep</button>
    {:else}
      <button type="button" class="text-link" onclick={() => (confirmingDelete = true)}>Delete</button>
    {/if}
  {/if}
  <span class="grow"></span>
  <button type="button" class="text-link" onclick={download} disabled={!source || (!open && !adding)} title="The source as a zip: index.ts with plugin-api.d.ts and a tsconfig.json, so it type-checks the same way in another editor">Download</button>
  <button type="button" class="pill framed" onclick={run} disabled={plugins.running || !source || (!open && !adding)} title="Transpile in the browser and run it on the stage (Ctrl+Enter)">{plugins.running ? "Running…" : "Run"}</button>
  <button type="button" class="pill primary" onclick={save} disabled={saving || !dirty || (adding && !newIdOk)} title="Store the source (Ctrl+S) – a plugin compiled by the content build gets a copy of its source here">{saving ? "Saving…" : "Save"}</button>
</div>

<style>
  .controls .grow { flex: 1; min-width: 6rem; }
  /* Monaco fills this box and follows its size: it needs a definite height */
  .editor { position: relative; flex: 1 1 0; min-height: 10rem; margin-top: .25rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--control-background); overflow: hidden; }
  .editor.has-error { border-color: var(--danger); }
  .monaco { position: absolute; inset: 0; }
  .loading { position: absolute; inset: 0; margin: 0; padding: .375rem .5rem; }
  .message { margin: .25rem 0 0; overflow-wrap: anywhere; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .375rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
  .text-link.danger { color: var(--danger); }
  .in-use { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
