<script lang="ts">
  import { ApiError, assetUsages, pluginUsages, type Usage } from "#lib/api.js";
  import { library } from "#lib/library.svelte.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { CODE_EXTENSIONS, codeFiles, codeKindOf, codeLanguage, codeUploadProblem, matchesCodeSearch, usageText, type CodeFile } from "#lib/library-code.js";
  import CodePreview from "./CodePreview.svelte";

  /**
   * The Library's code files (#186): the book's **scripts** (its plugin sources – the Code tab's list) and **shaders**
   * (assets of the kind `shader`, loaded by a plugin with `api.loadText(url)`), one list – name, kind, size, uses. A click
   * on a row opens it: where it is used, a read-only preview (`CodePreview`) and its actions – **Open in Code** (a
   * script), **Copy URL** (a shader: what a plugin loads), **Download**, **Replace…** (a file of the same kind: a script's
   * new source, a shader's new version – the sources that load it relinked) and **Delete** (refused while used –
   * *Delete anyway* forces it). Imported shaders (the content import's files) are read-only.
   */
  let { bookId, search = "", all = false, onopencode }: {
    bookId: string;
    search?: string;
    /** Shown under the media of the *all* filter: a head of its own, nothing when there is no code file */
    all?: boolean;
    /** The Code tab should show (the script to open is in `plugins.focus`) */
    onopencode?: () => void;
  } = $props();

  // Every time the Library opens: the uses follow the draft's rows
  $effect(() => { void plugins.load(bookId); });

  const files = $derived(codeFiles(plugins.stored, library.assets).filter(file => matchesCodeSearch(file, search)));
  let opened = $state<string | null>(null);
  const current = $derived(files.find(file => file.key === opened) ?? null);
  /** The opened file's text, its uses and (a script) what it registers */
  let text = $state<string | null>(null);
  let usages = $state<Usage[] | null>(null);
  let registers = $state<string[]>([]);
  let confirming = $state(false);
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);
  let replaceInput = $state<HTMLInputElement>();

  const size = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`);
  const message = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));

  const open = async (file: CodeFile) => {
    if (opened === file.key) {
      opened = null;
      return;
    }
    opened = file.key;
    await load(file);
  };

  /** The file's text and uses (again after a replace) */
  const load = async (file: CodeFile) => {
    text = null;
    usages = null;
    registers = [];
    confirming = false;
    error = null;
    try {
      if (file.plugin) {
        const [source, used] = await Promise.all([plugins.source(bookId, file.plugin), pluginUsages(bookId, file.plugin)]);
        if (opened !== file.key) return;
        text = source;
        usages = used.usages;
        registers = Object.values(used.registers).flat();
      } else if (file.asset) {
        const [response, used] = await Promise.all([fetch(file.asset.url), file.asset.imported ? null : assetUsages(bookId, file.asset.id)]);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const body = await response.text();
        if (opened !== file.key) return;
        text = body;
        usages = used?.usages ?? null;
      }
    } catch (e) {
      error = `${file.name}: ${message(e)}`;
    }
  };

  const openInCode = (file: CodeFile) => {
    if (!file.plugin) return;
    plugins.focus = file.plugin;
    onopencode?.();
  };

  const copyUrl = async (file: CodeFile) => {
    if (!file.asset) return;
    try {
      await navigator.clipboard.writeText(file.asset.url);
      notice = "URL copied – a plugin loads it with api.loadText(url)";
    } catch {
      notice = file.asset.url;
    }
  };

  const download = (file: CodeFile) => {
    if (text === null) return;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doReplace = async (file: CodeFile, chosen: File) => {
    notice = null;
    error = codeKindOf(chosen.name) !== file.kind ? `${chosen.name} is no ${file.kind} – a ${file.kind} is replaced by a ${CODE_EXTENSIONS[file.kind].join(" / ")} file` : codeUploadProblem(chosen);
    if (error) return;
    try {
      if (file.plugin) {
        await plugins.replaceFile(bookId, file.plugin, chosen);
        notice = `${file.plugin} has the source of ${chosen.name}`;
      } else if (file.asset) {
        const next = await library.replace(bookId, file.asset.id, chosen);
        notice = `${next.name} is version ${next.version}; ${next.usages} use${next.usages === 1 ? "" : "s"} relinked`;
      }
      const again = files.find(f => f.key === file.key);
      if (again) await load(again);
    } catch (e) {
      error = message(e);
    }
  };

  const remove = async (file: CodeFile, force: boolean) => {
    notice = null;
    error = null;
    try {
      if (file.plugin) await plugins.remove(bookId, file.plugin, force);
      else if (file.asset) await library.remove(bookId, file.asset.id, force);
      notice = `${file.name} deleted`;
      opened = null;
      confirming = false;
    } catch (e) {
      if (e instanceof ApiError && (e.code === "plugin-in-use" || e.code === "asset-in-use")) {
        confirming = true;
        usages = Array.isArray(e.details.usages) ? (e.details.usages as Usage[]) : usages;
      } else {
        error = message(e);
      }
    }
  };
</script>

{#if !all || files.length}
  {#if all}<div class="head"><span class="section-label">code</span><span class="small muted">{files.length} file{files.length === 1 ? "" : "s"}</span></div>{/if}
  {#if error}<p class="small danger">{error}</p>{/if}
  {#if notice}<p class="small muted notice">{notice}</p>{/if}
  {#if !files.length}
    <p class="muted small">{plugins.loading || library.loading ? "Loading…" : search ? "Nothing matches." : "No scripts or shaders yet."}</p>
  {:else}
    <table class="list">
      <thead><tr><th>name</th><th>kind</th><th class="num">size</th><th class="num">uses</th></tr></thead>
      <tbody>
        {#each files as file (file.key)}
          <tr class:on={opened === file.key} onclick={() => void open(file)}>
            <td class="name" title={file.asset?.url ?? `The plugin source ${file.plugin}`}><button type="button" class="open" aria-expanded={opened === file.key}>{file.name}</button>{#if file.version && file.version > 1} <span class="muted">v{file.version}</span>{/if}</td>
            <td class="muted kind">{file.kind}</td>
            <td class="num muted size">{size(file.size)}</td>
            <td class="num muted uses">{file.usages}<span class="unit">&nbsp;use{file.usages === 1 ? "" : "s"}</span></td>
          </tr>
          {#if opened === file.key}
            <tr class="more"><td colspan="4">
              <div class="detail">
                <p class="small muted used">
                  {#if usages === null}{file.asset?.imported ? "from the content import" : "…"}{:else if usages.length}used by {usageText(usages)}{:else}not used{/if}{#if registers.length}{` · registers ${registers.join(", ")}`}{/if}
                </p>
                {#if text !== null}
                  <CodePreview value={text} language={codeLanguage(file.name)} />
                {:else if !error}
                  <p class="small muted">loading…</p>
                {/if}
                <div class="actions">
                  {#if file.plugin}
                    <button type="button" class="pill primary" data-help-name="Open in Code" data-help="Opens this script in the Code tab: edit, Run on the stage, Save." onclick={() => openInCode(file)}>Open in Code</button>
                  {:else}
                    <button type="button" class="pill" data-help-name="Copy URL" data-help="Copies the shader's URL – a plugin loads the file with api.loadText(url). A replace gives a new URL and rewrites it in the plugin sources that name it." onclick={() => void copyUrl(file)}>Copy URL</button>
                  {/if}
                  <button type="button" class="text-link" disabled={text === null} onclick={() => download(file)}>Download</button>
                  {#if file.asset?.imported}
                    <span class="small muted" title="From the content import – replaced by the next import, not here">imported</span>
                  {:else}
                    <button type="button" class="text-link" data-help-name="Replace" data-help="A script: a .ts or .js file becomes its source. A shader: a new version of the file; the plugin sources that load it name the new one." onclick={() => replaceInput?.click()}>Replace…</button>
                    {#if confirming}
                      <span class="small danger">in use –</span>
                      <button type="button" class="text-link danger" onclick={() => void remove(file, true)}>Delete anyway</button>
                      <button type="button" class="text-link" onclick={() => (confirming = false)}>keep</button>
                    {:else}
                      <button type="button" class="text-link" onclick={() => void remove(file, false)}>Delete</button>
                    {/if}
                  {/if}
                </div>
                <input bind:this={replaceInput} type="file" accept={CODE_EXTENSIONS[file.kind].join(",")} hidden
                  onchange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void doReplace(file, f); (e.currentTarget as HTMLInputElement).value = ""; }} />
              </div>
            </td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
{/if}

<style>
  .head { display: flex; align-items: baseline; gap: .5rem; margin-top: .75rem; }
  .notice { overflow-wrap: anywhere; }
  .list { width: 100%; margin-top: .375rem; border-collapse: collapse; table-layout: fixed; }
  .list th { text-align: left; font-weight: normal; color: var(--muted); font-size: var(--text-small); }
  .list th, .list td { padding: .2rem .25rem; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .list th:nth-child(1) { width: 52%; }
  .list th:nth-child(2) { width: 18%; }
  .list th:nth-child(3) { width: 16%; }
  .list tbody tr { cursor: pointer; }
  @media (hover: hover) {
    .list tbody tr:hover { background: var(--hover-background); }
  }
  .list tr.on { background: var(--hover-background); }
  .list tr.on td { border-bottom-color: transparent; }
  .list tr.more { cursor: default; background: var(--hover-background); }
  .list .num { text-align: right; white-space: nowrap; }
  .list .unit { display: none; }
  .open { all: unset; cursor: pointer; }
  .open:focus-visible { outline: 1px solid var(--text); }
  .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detail { display: flex; flex-direction: column; gap: .375rem; padding: .125rem 0 .25rem; }
  .used { margin: 0; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .5rem; }
  .actions .pill { padding: 0 .5rem; height: 1.5rem; border-color: var(--line); }
  @media (pointer: coarse) { .actions .pill { height: var(--control-height); } }
  .text-link.danger { color: var(--danger); }
  /* Narrow: name and kind on one line, size and uses on the next (as the media list) */
  @container library (max-width: 26rem) {
    .list, .list tbody { display: block; }
    .list thead { display: none; }
    .list tbody tr { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "name name kind" ". size uses";
      column-gap: .75rem; row-gap: .125rem; align-items: baseline; min-height: 2.5rem; padding: .3rem .25rem; border-bottom: 1px solid var(--line); box-sizing: border-box; }
    .list tbody tr.on { border-bottom-color: transparent; }
    .list tbody tr.more { display: block; min-height: 0; padding: 0 .25rem .375rem; }
    .list th, .list td { padding: 0; border-bottom: none; }
    .list td { display: block; min-width: 0; }
    .list td:nth-child(1) { grid-area: name; }
    .list td.kind { grid-area: kind; text-align: right; }
    .list td.size { grid-area: size; font-size: var(--text-small); }
    .list td.uses { grid-area: uses; font-size: var(--text-small); }
    .list .unit { display: inline; }
  }
</style>
