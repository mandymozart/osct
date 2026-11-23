<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { ApiError, errorText, type Usage } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import { pluginOptions, usageText } from "#lib/library-code.js";
  import { buildErrorText, plugins } from "#lib/plugins.svelte.js";
  import { NEW_PLUGIN_SOURCE } from "#lib/plugins/compile.js";
  import { DOWNLOAD_EXTRAS, downloadFiles, unzipTexts, zipFiles } from "#lib/plugins/code-editor.js";
  import type { CodeEditor } from "#lib/plugins/monaco.js";
  import { newFileName, pluginFromZip, renameProblem, sizeText } from "#lib/plugins/plugin-files.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import { PLUGIN_BUNDLE_WARN_BYTES, PLUGIN_ENTRY, PLUGIN_FILE_PATTERN, pluginFilesProblems, sortPluginFiles, type PluginFile } from "@shared/types/plugins";

  /**
   * The **Code** tab: the experience's own code (docs/plugins.md "Trying it: the Code tab"). The plugins stored for
   * the experience and the ones the content declares (compiled by the content build), one open in Monaco (`plugins/monaco.ts`,
   * loaded with this tab only): TypeScript against the plugin API's types – completion and type errors inline as the
   * content build reports them; Tab indents, Ctrl+Enter runs, Ctrl+S saves.
   *
   * A plugin is a folder of files (#352): **one tab per file**, like Shadertoy's – `index.ts` first (the entry: it can't be
   * closed or renamed), the plugin's other TypeScript and shader files after it, a double-click renames one, its × deletes
   * it (an unsaved edit like any other: Save makes it stick, the change log keeps what was saved). **+** adds a file
   * (TypeScript, a fragment or vertex shader, a GLSL include, WGSL) or uploads files; files dropped on the tabs join the
   * plugin, a plugin's zip (its Download) dropped there becomes a new plugin. TypeScript imports its siblings by `./name`,
   * a shader file comes in as a string (`import WATER from "./water.frag"`).
   *
   * **Run** bundles the files in the browser (one file: transpiled; several: esbuild-wasm, `plugins/bundle.ts`) and
   * installs the module in the stage's registry, so a layer or component shows on the stage and in the Inspector at once;
   * **Save** stores the files; a Run's error shows under the editor and as a marker on its line, in its file's tab;
   * **Download** gives the files with `plugin-api.d.ts`, the shader imports' types and a tsconfig, so they type-check the
   * same way elsewhere. A Run reaches no reader; the stored files do with the next **Publish**, which type-checks them and
   * bundles them as a Run does (#78, #352). The status line says the files' count and the bundle's size – above 256 KB a
   * warning. A plugin pushed from someone's folder (`osct plugin push`) is **linked**: a strip names the folder and when
   * it came; editing here is still allowed (`osct plugin pull` takes it back), *Unlink* drops the link.
   *
   * The Library lists the stored plugins as its scripts and opens one here (`plugins.focus`); **Delete** is refused while
   * the draft uses what the plugin registers (*Delete anyway* forces it). The picker names each plugin alone, the one with
   * unsaved edits with an asterisk (`pluginLabel`, #232); the open plugin is kept in `plugins.code`, so a tab switch loses
   * no edit. The code runs on the stage in this page, with the person's session (#340): its `api.log` lines and its errors
   * there show as the **log** under the editor, newest last, empty with each Run. A plugin someone else saved last loads
   * by itself only after the guard's prompt (`plugin-guard.svelte.ts`) – one kept off says so on its status line.
   * The stored plugins load onto the stage by themselves whenever it starts and run again on Save (#269,
   * `plugins.autoLoad`); the line under the picker says what of the open plugin runs there (`plugins.status`).
   */
  let { experienceId, stage }: { experienceId: string; stage: Stage | null } = $props();

  const PLUGIN_ID = /^[a-z][a-z0-9-]{0,39}$/;
  /** What + adds: a kind, its extension, the name a new one starts with */
  const ADD_KINDS = [
    { label: "TypeScript file", extension: "ts", stem: "file" },
    { label: "Fragment shader", extension: "frag", stem: "shader" },
    { label: "Vertex shader", extension: "vert", stem: "shader" },
    { label: "GLSL include", extension: "glsl", stem: "common" },
    { label: "WGSL", extension: "wgsl", stem: "shader" },
  ] as const;

  /** The open plugin (`plugins.code`): the plugin, its files, the files as stored and as loaded */
  const buffer = plugins.code;
  let loadingSource = $state(false);
  let saving = $state(false);
  let notice = $state<string | null>(null);
  let confirmingDelete = $state(false);
  /** The delete was refused: where the draft uses the plugin's types */
  let inUse = $state<string | null>(null);
  let host = $state<HTMLElement>();
  let code = $state<CodeEditor | null>(null);
  let codeError = $state<string | null>(null);
  /** + is open */
  let adding = $state(false);
  /** The file whose tab is being renamed, and the name typed */
  let renaming = $state<string | null>(null);
  let newName = $state("");
  let dragOver = $state(false);
  let upload = $state<HTMLInputElement>();

  $effect(() => {
    if (plugins.experienceId !== experienceId) void plugins.load(experienceId);
  });

  // The plugins the content declares (compiled by the build) follow the content; the stored ones the API
  const declared = $derived.by(() => { void content.hash; return plugins.declared(); });
  const storedIds = $derived(plugins.stored.map(p => p.id));
  /** Every plugin shown: stored sources first, then declared ones without a stored source – an unchanged one by its name alone, whether stored or not (#232) */
  const shown = $derived([
    ...plugins.stored.map(p => ({ id: p.id, stored: true, declared: declared.some(d => d.id === p.id), size: p.size })),
    ...declared.filter(d => !storedIds.includes(d.id)).map(d => ({ id: d.id, stored: false, declared: true, size: 0 })),
  ]);
  /** Save has something to store: edits, or a declared plugin's files that have no stored copy yet */
  const dirty = $derived(buffer.key !== buffer.saved);
  const current = $derived(shown.find(p => p.id === buffer.open));
  const options = $derived(pluginOptions(shown.map(p => p.id), buffer));
  const hasPlugin = $derived(!!buffer.open || buffer.adding);
  /** What is wrong with the files as they are (a name, a size) – Save waits for it */
  const filesProblem = $derived(hasPlugin ? (pluginFilesProblems(buffer.files)[0] ?? null) : null);

  // A plugin deleted while the tab was closed (the Library's Delete) is no longer open
  $effect(() => {
    if (buffer.open && plugins.experienceId === experienceId && !plugins.loading && !shown.some(p => p.id === buffer.open)) untrack(() => buffer.reset());
  });

  // The Library's *Open in Code*: that plugin, once the list knows it
  $effect(() => {
    const focus = plugins.focus;
    if (!focus || !shown.some(p => p.id === focus)) return;
    untrack(() => {
      plugins.focus = null;
      if (buffer.open !== focus) void openPlugin(focus);
    });
  });

  // The first plugin opens by itself
  $effect(() => {
    const first = shown[0]?.id;
    if (buffer.open === null && first && !plugins.focus && !untrack(() => buffer.adding)) void openPlugin(first);
  });

  const resetEditing = () => {
    notice = null;
    confirmingDelete = false;
    inUse = null;
    adding = false;
    renaming = null;
  };

  const openPlugin = async (id: string) => {
    if (buffer.unsaved && !window.confirm("Discard the unsaved changes?")) return;
    buffer.open = id;
    buffer.adding = false;
    buffer.active = PLUGIN_ENTRY;
    resetEditing();
    loadingSource = true;
    try {
      if (storedIds.includes(id)) {
        const { files, origin } = await plugins.readStored(experienceId, id);
        buffer.load(files, true, origin);
      } else {
        buffer.load(await plugins.declaredFiles(declared.find(d => d.id === id)!.src), false);
      }
    } catch (e) {
      buffer.load([{ name: PLUGIN_ENTRY, text: "" }], false);
      notice = `The source could not be read: ${errorText(e)}`;
    } finally {
      loadingSource = false;
    }
  };

  /** A new plugin: the template, or the files of a dropped zip with the id its folder gives */
  const startNew = (files: PluginFile[] = [{ name: PLUGIN_ENTRY, text: NEW_PLUGIN_SOURCE }], id = "") => {
    if (buffer.unsaved && !window.confirm("Discard the unsaved changes?")) return;
    buffer.adding = true;
    buffer.open = null;
    buffer.newId = id;
    buffer.active = PLUGIN_ENTRY;
    buffer.load(files, false);
    // A new plugin's files are all unsaved
    buffer.loaded = "";
    resetEditing();
  };
  const newIdOk = $derived(PLUGIN_ID.test(buffer.newId) && !shown.some(p => p.id === buffer.newId));

  const save = async () => {
    const id = buffer.adding ? buffer.newId : buffer.open;
    if (!id || (buffer.adding && !newIdOk) || filesProblem) return;
    saving = true;
    notice = null;
    try {
      const files = sortPluginFiles(buffer.files);
      const summary = await plugins.save(experienceId, id, files);
      buffer.open = id;
      buffer.adding = false;
      buffer.load(files, true, summary.origin);
      notice = `saved ${id}`;
      // Saved code is what the stage runs (#269): the save runs it too
      if (stage && (await plugins.run(id, files, stage))) notice = `saved and ran ${id}`;
      else showErrorFile();
    } catch {
      // plugins.error says
    } finally {
      saving = false;
    }
  };

  /** A Run's error in another file: its tab comes forward, so the marker is seen */
  const showErrorFile = () => {
    const file = plugins.runError?.file;
    if (file && buffer.files.some(f => f.name === file)) buffer.active = file;
  };

  const run = async () => {
    const id = buffer.adding ? (newIdOk ? buffer.newId : "draft") : buffer.open;
    if (!id) return;
    notice = null;
    const ok = await plugins.run(id, buffer.files, stage);
    if (ok) notice = `ran ${id}${plugins.lastRun?.types.length ? ` – registered ${plugins.lastRun.types.join(", ")}` : ""}`;
    else showErrorFile();
  };

  const remove = async (force = false) => {
    const id = buffer.open;
    if (!id || !current?.stored) return;
    try {
      await plugins.remove(experienceId, id, force);
      confirmingDelete = false;
      inUse = null;
      notice = `${id} deleted`;
      buffer.reset();
    } catch (e) {
      if (e instanceof ApiError && e.code === "plugin-in-use") inUse = usageText((e.details.usages as Usage[] | undefined) ?? []);
      else plugins.error = errorText(e);
    }
  };

  const unlink = async () => {
    const id = buffer.open;
    if (!id) return;
    try {
      // The stored files go back as they are – the link goes, unsaved edits stay edits
      const stored = await plugins.files(experienceId, id);
      const summary = await plugins.save(experienceId, id, stored, null);
      buffer.origin = summary.origin;
      notice = `${id} is no longer linked`;
    } catch {
      // plugins.error says
    }
  };

  const download = async () => {
    const id = buffer.adding ? buffer.newId || "plugin" : buffer.open;
    if (!id) return;
    const { default: pluginApi } = await import("#lib/plugins/plugin-api.d.ts?raw");
    const zip = zipFiles(downloadFiles(id, sortPluginFiles(buffer.files), pluginApi));
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${id}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ── Files ─────────────────────────────────────────────────────────────────────────────────────

  /** + → a new file of that kind, its tab open and its name ready to type */
  const addFile = (kind: (typeof ADD_KINDS)[number]) => {
    adding = false;
    const name = newFileName(buffer.files.map(f => f.name), kind.stem, kind.extension);
    buffer.files = [...buffer.files, { name, text: kind.extension === "ts" ? "export {};\n" : "" }];
    buffer.active = name;
    startRename(name);
  };

  /** × on a tab: the file is gone from the plugin (unsaved until Save) */
  const closeFile = (name: string) => {
    if (name === PLUGIN_ENTRY) return;
    buffer.files = buffer.files.filter(f => f.name !== name);
    if (buffer.active === name) buffer.active = PLUGIN_ENTRY;
    notice = `${name} removed – Save makes it stick`;
  };

  const startRename = (name: string) => {
    if (name === PLUGIN_ENTRY) return;
    renaming = name;
    newName = name;
  };
  const renameError = $derived(renaming ? renameProblem(buffer.files.map(f => f.name), renaming, newName) : null);
  const finishRename = () => {
    const from = renaming;
    renaming = null;
    if (!from || newName === from || renameProblem(buffer.files.map(f => f.name), from, newName)) return;
    buffer.files = buffer.files.map(f => (f.name === from ? { name: newName, text: f.text } : f));
    if (buffer.active === from) buffer.active = newName;
  };

  /** Files from the + menu's upload or a drop: text files with a plugin's extension join it (one there is replaced); a zip becomes a new plugin */
  const takeFiles = async (list: FileList | File[]) => {
    const files = [...list];
    const zip = files.find(f => f.name.toLowerCase().endsWith(".zip"));
    try {
      if (zip) {
        const made = pluginFromZip(await unzipTexts(new Uint8Array(await zip.arrayBuffer())), zip.name, DOWNLOAD_EXTRAS);
        startNew(made.files, PLUGIN_ID.test(made.id) && !shown.some(p => p.id === made.id) ? made.id : "");
        notice = `${made.files.length} files from ${zip.name} – name the plugin and Save`;
        return;
      }
      if (!hasPlugin) {
        notice = "Open or start a plugin first";
        return;
      }
      const taken: string[] = [];
      const skipped: string[] = [];
      let next = [...buffer.files];
      for (const file of files) {
        if (!PLUGIN_FILE_PATTERN.test(file.name)) { skipped.push(file.name); continue; }
        const text = (await file.text()).replace(/^﻿/, "");
        next = [...next.filter(f => f.name !== file.name), { name: file.name, text }];
        taken.push(file.name);
      }
      buffer.files = next;
      if (taken.length) buffer.active = taken[taken.length - 1];
      notice = [taken.length ? `added ${taken.join(", ")} – Save keeps them` : "", skipped.length ? `not a plugin's file: ${skipped.join(", ")}` : ""].filter(Boolean).join(" · ");
    } catch (e) {
      notice = `The files could not be read: ${errorText(e)}`;
    }
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files.length) void takeFiles(e.dataTransfer.files);
  };

  const readOnly = $derived(loadingSource || !hasPlugin);

  // Monaco comes with this tab (its own chunk); the panel works on `buffer.files`, the editor mirrors them – one model per file
  onMount(() => {
    let disposed = false;
    let editor: CodeEditor | null = null;
    import("#lib/plugins/monaco.js").then(({ createCodeEditor }) => {
      if (disposed || !host) return;
      editor = createCodeEditor(host, {
        readOnly: untrack(() => readOnly),
        onChange: (name, value) => {
          if (buffer.files.find(f => f.name === name)?.text === value) return;
          buffer.files = buffer.files.map(f => (f.name === name ? { name, text: value } : f));
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
  $effect(() => { code?.sync(buffer.adding ? "" : buffer.open ?? "", buffer.files, buffer.active); });
  $effect(() => { code?.setReadOnly(readOnly); });
  /** The Run's error marks its line in its own file's tab */
  $effect(() => {
    const error = plugins.runError;
    code?.setRunError(error && (error.file ?? PLUGIN_ENTRY) === buffer.active ? error : null);
  });
  const errorLine = $derived(plugins.runError?.line ?? null);

  /** What of the open plugin runs on the stage (#269) */
  const openStatus = $derived.by((): { text: string; danger: boolean } | null => {
    if (!buffer.open || !current?.stored) return null;
    const status = plugins.status.get(buffer.open);
    if (!status) return { text: plugins.autoLoading ? "on the stage: waiting to load…" : "on the stage: not loaded yet", danger: false };
    switch (status.state) {
      case "loading": return { text: "on the stage: loading…", danger: false };
      case "saved": return { text: buffer.unsaved ? "on the stage: the saved version – Run tries the edits" : "on the stage: the saved version", danger: false };
      case "edits": return { text: "on the stage: edits not saved – Save keeps them", danger: false };
      // A Run's own error shows below, with its line
      case "failed": return plugins.runError?.plugin === buffer.open ? null : { text: `failed on the stage: ${status.error} – what ran before stays`, danger: true };
      case "skipped": return { text: `not loaded: ${status.error}`, danger: true };
    }
  });
  /** The files and the last bundle's size (#352): above 256 KB a warning – readers download it with the AR scene */
  const sizeLine = $derived.by((): { text: string; warn: boolean } | null => {
    if (!hasPlugin) return null;
    const bundled = buffer.open ? plugins.bundleSize.get(buffer.open) : undefined;
    const count = `${buffer.files.length} ${buffer.files.length === 1 ? "file" : "files"}`;
    if (bundled === undefined) return { text: count, warn: false };
    const warn = bundled > PLUGIN_BUNDLE_WARN_BYTES;
    return { text: `${count}, ${sizeText(bundled)} bundled${warn ? " – readers download it with the AR scene" : ""}`, warn };
  });
  /** The other stored sources that are not on the stage */
  const othersFailed = $derived(plugins.failed().filter(f => f.id !== buffer.open));
  const ago = (iso: string): string => {
    const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (seconds < 90) return "just now";
    if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
    if (seconds < 129600) return `${Math.round(seconds / 3600)} h ago`;
    return `${Math.round(seconds / 86400)} days ago`;
  };
</script>

<div class="row"><span class="label">plugin</span>
  <span class="controls">
    <select class="field grow" aria-label="Plugin" value={buffer.adding ? "" : buffer.open ?? ""} onchange={e => { const id = (e.currentTarget as HTMLSelectElement).value; if (id) void openPlugin(id); }}
      data-help-name="Plugin" data-help="The experience's plugins: the ones stored for it and the ones the content build compiles. An asterisk after a name marks unsaved edits – Save stores them. Whether readers have the stored plugins, the top bar says (draft only, live on …).">
      {#if !shown.length && !buffer.adding}<option value="">{plugins.loading ? "loading…" : "no plugin yet"}</option>{/if}
      {#each options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
    <button type="button" class="pill framed" title="New plugin" onclick={() => startNew()}>new</button>
  </span></div>
{#if buffer.adding}
  <div class="row" data-help-name="Plugin id" data-help="The new plugin's folder name: letters, digits and -."><span class="label">id</span>
    <span class="controls">
      <input class="field grow" placeholder="tint" spellcheck="false" bind:value={buffer.newId} aria-label="Plugin id" />
    </span></div>
{/if}
{#if buffer.origin && !buffer.adding}
  <p class="linked small" data-help-name="Linked" data-help="This plugin is pushed from someone's folder with osct plugin push – every push runs on the stage. Edits here are allowed: osct plugin pull takes them back to the folder. Unlink drops the link, the files stay.">
    <span class="dot" aria-hidden="true"></span>
    <span class="grow">linked · {buffer.origin.by ? `${buffer.origin.by.split("@")[0]}'s` : "a"} folder <code>{buffer.origin.folder}</code>, pushed {ago(buffer.origin.at)}</span>
    <button type="button" class="text-link" onclick={unlink}>Unlink</button>
  </p>
{/if}

{#if hasPlugin}
  <!-- One tab per file (#352), the entry first; + at the right edge; files dropped here join the plugin -->
  <div class="files" class:drag-over={dragOver} role="tablist" aria-label="The plugin's files" tabindex="-1"
    ondragover={e => { e.preventDefault(); dragOver = true; }} ondragleave={() => (dragOver = false)} ondrop={drop}
    data-help-name="Files" data-help="The plugin's files, one tab each: index.ts is the entry; TypeScript imports its siblings by ./name, a shader file comes in as a string (import WATER from './water.frag'). Double-click a tab to rename it, × deletes the file (Save makes it stick). + adds a file; drop files here to add them, or a plugin's zip to make it a new plugin.">
    <div class="tabs">
      {#each buffer.files as file (file.name)}
        {#if renaming === file.name}
          <input class="tab rename" class:invalid={!!renameError} bind:value={newName} spellcheck="false" aria-label="The file's new name" title={renameError ?? "Enter keeps it, Esc goes back"}
            onkeydown={e => { if (e.key === "Enter") finishRename(); else if (e.key === "Escape") renaming = null; }} onblur={finishRename} {@attach el => { el.focus(); el.setSelectionRange(0, newName.lastIndexOf(".")); }} />
        {:else}
          <div class="tab" class:on={buffer.active === file.name} class:entry={file.name === PLUGIN_ENTRY} role="tab" tabindex="0" aria-selected={buffer.active === file.name}
            title={file.name === PLUGIN_ENTRY ? "The entry: it exports register(api)" : "Double-click to rename"}
            onclick={() => (buffer.active = file.name)} ondblclick={() => startRename(file.name)}
            onkeydown={e => { if (e.key === "Enter" || e.key === " ") buffer.active = file.name; else if (e.key === "F2") startRename(file.name); }}>
            <span class="name">{file.name}</span>
            {#if file.name !== PLUGIN_ENTRY}
              <button type="button" class="close" aria-label="Delete {file.name}" title="Delete the file (Save makes it stick)" onclick={e => { e.stopPropagation(); closeFile(file.name); }}>×</button>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
    <button type="button" class="add" class:open={adding} aria-label="Add a file" aria-expanded={adding} title="Add a file to this plugin" onclick={() => (adding = !adding)}>+</button>
    {#if adding}
      <div class="menu" role="menu">
        {#each ADD_KINDS as kind (kind.extension)}
          <button type="button" role="menuitem" onclick={() => addFile(kind)}>{kind.label} <span class="muted">.{kind.extension}</span></button>
        {/each}
        <hr />
        <button type="button" role="menuitem" onclick={() => { adding = false; upload?.click(); }}>Upload files…</button>
        <p class="small muted">or drop them on the tabs</p>
      </div>
    {/if}
    <input type="file" multiple hidden accept=".ts,.frag,.vert,.glsl,.wgsl,.zip" bind:this={upload} onchange={e => { const input = e.currentTarget as HTMLInputElement; if (input.files) void takeFiles(input.files); input.value = ""; }} />
  </div>
{/if}

<div class="editor" class:has-error={errorLine !== null} data-help-name="Plugin source" data-help="The open file: TypeScript checked against the plugin API as the content build checks it – completion with Ctrl+Space, type errors underlined – or a shader. Run (Ctrl+Enter) shows the plugin on the stage; Save (Ctrl+S) stores its files. Readers get the saved files with the next Publish, which type-checks them first.">
  <div class="monaco" bind:this={host}></div>
  {#if !code}<p class="small muted loading">{codeError ?? "loading the code editor…"}</p>{/if}
</div>

{#if openStatus || sizeLine}
  <p class="small message status" class:danger={openStatus?.danger} data-help-name="On the stage" data-help="What of this plugin runs on the stage, its files and the size of its last bundle – above 256 KB a warning: readers download it with the AR scene. The saved files load by themselves whenever the stage starts, and again on Save; Run tries the unsaved edits. A plugin that fails keeps what ran before.">
    {openStatus?.text ?? ""}{openStatus && sizeLine ? " · " : ""}{#if sizeLine}<span class:warn={sizeLine.warn}>{sizeLine.text}</span>{/if}
  </p>
{/if}
{#if othersFailed.length}
  <p class="small danger message" title={othersFailed.map(f => `${f.id}: ${f.error}`).join("\n")}>not on the stage: {othersFailed.map(f => f.id).join(", ")}</p>
{/if}
{#if plugins.runError}
  <p class="small danger message">{buildErrorText(plugins.runError)}</p>
{:else if plugins.error}
  <p class="small danger message">{plugins.error}</p>
{:else if filesProblem}
  <p class="small danger message">{filesProblem}</p>
{:else if notice}
  <p class="small muted message">{notice}</p>
{/if}
{#if plugins.logs.length}
  <ol class="log small" aria-label="The plugins' log" data-help-name="Log" data-help="What the experience's code says on the stage, newest last: a plugin's api.log lines and its errors (a build that failed, an error nothing caught). Every Run starts it anew.">
    {#each plugins.logs as line, i (i)}<li class:danger={line.level === "error"}>{line.text}</li>{/each}
  </ol>
{/if}

<div class="actions">
  {#if current?.stored}
    {#if inUse !== null}
      <span class="small danger in-use" title="Where the draft uses what the plugin registers">used by {inUse || "the draft"} –</span>
      <button type="button" class="text-link danger" onclick={() => void remove(true)}>Delete anyway</button>
      <button type="button" class="text-link" onclick={() => { inUse = null; confirmingDelete = false; }}>keep</button>
    {:else if confirmingDelete}
      <button type="button" class="text-link danger" onclick={() => void remove()}>Delete {buffer.open}</button>
      <button type="button" class="text-link" onclick={() => (confirmingDelete = false)}>keep</button>
    {:else}
      <button type="button" class="text-link" onclick={() => (confirmingDelete = true)}>Delete</button>
    {/if}
  {/if}
  <span class="grow"></span>
  <button type="button" class="text-link" onclick={download} disabled={!hasPlugin} title="The plugin's files as a zip, with plugin-api.d.ts and a tsconfig.json, so they type-check the same way in another editor – drop the zip here again to make it a plugin">Download</button>
  <button type="button" class="pill framed" onclick={run} disabled={plugins.running || !hasPlugin} title="Bundle in the browser and run it on the stage (Ctrl+Enter)">{plugins.running ? "Running…" : "Run"}</button>
  <button type="button" class="pill primary" onclick={save} disabled={saving || !dirty || !!filesProblem || (buffer.adding && !newIdOk)} title="Store the files (Ctrl+S) – a plugin compiled by the content build gets a copy of its files here">{saving ? "Saving…" : "Save"}</button>
</div>

<style>
  .controls .grow { flex: 1; min-width: 6rem; }
  /* The linked strip: the folder a push came from */
  .linked { display: flex; align-items: center; gap: .375rem; margin: .25rem 0 0; padding: .25rem 0; border-bottom: 1px solid var(--line); }
  .linked .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success, #6cc070); flex: none; }
  .linked .grow { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* The files: one tab each, scrolling sideways under + at the right edge */
  .files { position: relative; display: flex; align-items: stretch; height: 1.625rem; margin-top: .375rem; border-bottom: 1px solid var(--line); }
  .files.drag-over { outline: 1px dashed var(--text); outline-offset: -1px; }
  .tabs { display: flex; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .tab { display: flex; align-items: center; gap: .25rem; padding: 0 .5rem; flex: none; font: 11px ui-monospace, Consolas, monospace; color: var(--muted); border-right: 1px solid var(--line); cursor: pointer; white-space: nowrap; background: none; }
  .tab.on { color: var(--text); background: var(--control-background); box-shadow: inset 0 2px 0 var(--text); }
  .tab .close { border: 0; background: none; color: var(--muted); padding: 0 .125rem; font: inherit; visibility: hidden; cursor: pointer; }
  .tab.on .close { visibility: visible; }
  .tab.rename { width: 9rem; border: 1px solid var(--text); color: var(--text); background: var(--control-background); outline: none; cursor: text; }
  .tab.rename.invalid { border-color: var(--danger); }
  .add { flex: none; width: 1.75rem; border: 0; border-left: 1px solid var(--line); background: var(--surface, transparent); color: var(--text); font-size: 15px; cursor: pointer; }
  .add.open { background: var(--control-background); }
  .menu { position: absolute; right: 0; top: 100%; z-index: 5; width: 12rem; padding: .25rem 0; background: var(--surface, var(--control-background)); border: 1px solid var(--line); box-shadow: 0 4px 12px rgb(0 0 0 / .3); }
  .menu button { display: block; width: 100%; text-align: left; padding: .375rem .625rem; border: 0; background: none; color: var(--text); font: inherit; cursor: pointer; }
  @media (hover: hover) {
    .tab:hover .close { visibility: visible; }
    .tab .close:hover { color: var(--text); }
    .add:hover { background: var(--control-background); }
    .menu button:hover { background: var(--hover-background, var(--control-background)); }
  }
  .menu hr { border: 0; border-top: 1px solid var(--line); margin: .25rem 0; }
  .menu p { margin: 0; padding: 0 .625rem .25rem; }
  /* Monaco fills this box and follows its size: it needs a definite height */
  .editor { position: relative; flex: 1 1 0; min-height: 10rem; margin-top: .25rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--control-background); overflow: hidden; }
  .editor.has-error { border-color: var(--danger); }
  .monaco { position: absolute; inset: 0; }
  .loading { position: absolute; inset: 0; margin: 0; padding: .375rem .5rem; }
  .message { margin: .25rem 0 0; overflow-wrap: anywhere; }
  .warn { color: var(--danger); }
  .log { max-height: 6rem; margin: .25rem 0 0; padding: .25rem .5rem; list-style: none; overflow: auto; border: 1px solid var(--line); border-radius: var(--control-radius); font-family: ui-monospace, Consolas, monospace; }
  .log li { white-space: pre-wrap; overflow-wrap: anywhere; }
  .log .danger { color: var(--danger); }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .375rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
  .text-link.danger { color: var(--danger); }
  .in-use { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
