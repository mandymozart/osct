<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { ENTRY_CATEGORIES } from "@shared/types/entry";
  import { exprMessage, renderEntryText, textVariables, variablesOf } from "@shared/text/entry-text";
  import { errorText, putEntry, type EditorEntry, type EntrySaved } from "#lib/api.js";
  import { draftOf, draftProblems, entryChanges, imageUrl, type EntryDraft } from "#lib/entry-edit.js";
  import { entryLink } from "#lib/entry-view.js";
  import { entries } from "#lib/entries.svelte.js";
  import { library } from "#lib/library.svelte.js";
  import { pickAccept, type LibraryPick } from "#lib/library-pick.js";
  import { trackUnsaved } from "#lib/unsaved.js";
  import FileField from "#lib/components/FileField.svelte";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Segmented from "#lib/components/Segmented.svelte";

  /**
   * An entry's form (#223), in the Inspector's place of the entry the tree selects and on the Entries page: the title,
   * category and access page, the author and tags, the text with its live preview, the picture from the Library, a
   * link's URL and the target. The preview is the reader's renderer (`renderEntryText`: Markdown with the book's
   * variables) – on the stage with the variables' current values, elsewhere with none set; the variables the text reads
   * are listed with their values, what does not parse below. Edits stay here until **Save** (only the fields that
   * changed, `PUT …/entries/{id}`); *Back to the draft* drops them; a reload asks first (`unsaved.ts`).
   */
  let { bookId, entry, assetsBase = null, vars = null, onpick, onsaved, onselecttarget }: {
    bookId: string;
    entry: EditorEntry;
    /** Where the content's paths resolve (the picture's preview) */
    assetsBase?: string | null;
    /** The stage's variables in their scopes; null: no stage – every variable shows as not set */
    vars?: ReadonlyArray<{ scope: string; name: string; value: unknown }> | null;
    /** Open the Library as a picker for the picture (the host shows it in this place) */
    onpick?: (pick: Omit<LibraryPick, "oncancel">) => void;
    /** After a save: the draft changed (reload it; a new page may have moved the entry to another spread) */
    onsaved?: (saved: EntrySaved) => void | Promise<void>;
    onselecttarget?: (targetId: string) => void;
  } = $props();

  let draft = $state<EntryDraft>(untrack(() => draftOf(entry)));
  let editing = $state(untrack(() => entry.id));
  let saving = $state(false);
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);

  // Another entry, or this one saved: the form starts from it
  $effect(() => {
    const e = entry;
    untrack(() => {
      if (editing === e.id && dirty) return;
      if (editing !== e.id) {
        notice = null;
        error = null;
      }
      editing = e.id;
      draft = draftOf(e);
    });
  });

  // The selection may move on (the book, another spread) a moment before the Inspector drops this form: no entry, no changes
  const changes = $derived(entry ? entryChanges(entry, draft) : {});
  const dirty = $derived(Object.keys(changes).length > 0);
  const problems = $derived(draftProblems(draft));
  onMount(() => trackUnsaved(() => dirty));

  const lookup = $derived(variablesOf(vars ?? []));
  const rendered = $derived(renderEntryText(draft.body, { variables: lookup }));
  const used = $derived(textVariables(draft.body).map(name => ({ name, value: lookup(name) })));
  const textProblems = $derived(rendered.problems.filter(p => p.code !== "missing-value"));
  const link = $derived(entryLink(draft.media));
  const imageSrc = $derived(draft.image ? imageUrl(draft.image, assetsBase) : "");

  const edit = (patch: Partial<EntryDraft>) => {
    draft = { ...draft, ...patch };
    notice = null;
  };
  const revert = () => {
    draft = draftOf(entry);
    notice = null;
    error = null;
  };
  const save = async () => {
    if (!dirty || problems.length) return;
    saving = true;
    error = null;
    try {
      const saved = await putEntry(bookId, entry.id, changes);
      entries.saved(saved.entry, saved.spreadId);
      draft = draftOf({ ...saved.entry });
      notice = saved.spreadId !== saved.previousSpreadId ? `Saved – now on ${saved.spreadId ?? "no spread"}` : "Saved";
      await onsaved?.(saved);
    } catch (e) {
      error = errorText(e);
    } finally {
      saving = false;
    }
  };
  const pickImage = () =>
    onpick?.({ subject: { for: "entry-image" }, label: `the picture of ${entry.title}`, current: draft.image || undefined, onpick: asset => edit({ image: asset.url }) });
  const upload = async (file: File) => {
    try {
      edit({ image: (await library.upload(bookId, file)).url });
    } catch {
      // library.error says
    }
  };
  const shown = (value: unknown): string => (typeof value === "string" ? `"${value}"` : String(value));
  const scopeOf = (name: string): string | undefined => {
    const order = ["spread", "stage", "session", "book"];
    return (vars ?? []).filter(v => v.name === name).sort((a, b) => order.indexOf(a.scope) - order.indexOf(b.scope))[0]?.scope;
  };
</script>

<div class="section" data-help-name="Entry" data-help="The entry as the reader reads it in the list: its fields, its text, its picture and link, and its target. Edits show in the preview at once and reach the draft with Save.">
  <span class="section-label">entry · {entry.title}</span>
  <span class="small muted">{entry.spreadId ? `on ${entry.spreadId}` : "on no spread"}</span>
</div>
<div class="row" class:changed={"title" in changes}><span class="label">title</span>
  <input class="field" value={draft.title} aria-label="Title" oninput={e => edit({ title: e.currentTarget.value })} data-help="The entry's name – the list and the entry's head show it." /></div>
<div class="row" class:changed={"category" in changes}><span class="label">category</span>
  <span class="controls"><Segmented options={ENTRY_CATEGORIES} value={draft.category as (typeof ENTRY_CATEGORIES)[number]} label="Category" onchange={category => edit({ category })} /></span></div>
<div class="row" class:changed={"page" in changes} data-help-name="Access page" data-help="The printed page the entry belongs to – it decides the spread. A page on another spread moves the entry there; a page no spread has leaves it on none.">
  <span class="label">access page</span>
  <span class="w"><ScrubNumber value={draft.page} min={0} step={1} prefix="p." label="access page" oninput={page => edit({ page: Math.round(page) })} /></span></div>
<div class="row" class:changed={"author" in changes}><span class="label">author</span>
  <input class="field" value={draft.author} aria-label="Author" placeholder="none" oninput={e => edit({ author: e.currentTarget.value })} data-help="Who wrote the text – the reader shows it for texts." /></div>
<div class="row" class:changed={"tags" in changes}><span class="label">tags</span>
  <input class="field" value={draft.tags} aria-label="Tags" placeholder="none – words, separated by commas" oninput={e => edit({ tags: e.currentTarget.value })} data-help="Words that describe the entry, separated by commas." /></div>
<div class="row top" class:changed={"body" in changes}><span class="label">text</span>
  <textarea class="field body" rows="8" value={draft.body} aria-label="Text" spellcheck="true" oninput={e => edit({ body: e.currentTarget.value })}
    data-help-name="Text" data-help="Markdown: a blank line starts a paragraph, *emphasis*, **strong**, [a link](https://…). The book's variables in braces: {'{hasKey}'} prints a value, {'{hasKey: the door opens|it is locked}'} chooses a text – a variable that is not set shows as nothing, so the part after | is its fallback. A backslash before a brace writes the brace."></textarea></div>
<div class="row top"><span class="label">preview</span>
  <div class="preview" data-help-name="Preview" data-help="The text as the reader shows it – the reader's own renderer. On the stage the variables have their current values (set them in the spread's vars and events); on the Entries page none is set.">
    {#if rendered.html}<div class="reader">{@html rendered.html}</div>{:else}<span class="small muted">no text</span>{/if}
    {#if used.length}
      <p class="small muted vars">{#each used as v, i (v.name)}{i ? " · " : ""}<code>{v.name}</code> {v.value === undefined ? "not set" : `= ${shown(v.value)}${scopeOf(v.name) ? ` (${scopeOf(v.name)})` : ""}`}{/each}{vars === null ? " – no stage here" : ""}</p>
    {/if}
    {#each textProblems as problem (problem.start + problem.code)}<p class="small danger">{exprMessage(problem)}</p>{/each}
  </div></div>
<div class="row" class:changed={"image" in changes}><span class="label">picture</span>
  <FileField src={imageSrc} picture empty="none" accept={pickAccept({ for: "entry-image" })} label="the entry's picture" onlibrary={pickImage} onupload={f => void upload(f)} />
</div>
{#if draft.image}
  <div class="row"><span class="label"></span><span class="controls"><button type="button" class="text-link" onclick={() => edit({ image: "" })}>remove the picture</button></span></div>
{/if}
<div class="row" class:changed={"media" in changes}><span class="label">link</span>
  <span class="controls link">
    <input class="field" value={draft.media} type="url" inputmode="url" aria-label="Link" placeholder="none – https://…" oninput={e => edit({ media: e.currentTarget.value })}
      data-help="An address on the web: a link entry embeds it (a video of YouTube or Vimeo plays) and opens it in a new tab." />
    {#if link}<a class="text-link" href={link} target="_blank" rel="noopener noreferrer" title="Opens the link in a new tab">open</a>{/if}
  </span></div>
<div class="row"><span class="label">target</span>
  <span class="controls">
    {#if entry.target}
      <span class="value">{entry.target.id}</span>
      {#if onselecttarget}
        {@const targetId = entry.target.id}
        <button type="button" class="text-link" onclick={() => onselecttarget(targetId)}
          data-help-name="Select the target" data-help="Selects the entry's target: the tree highlights its row, the Inspector shows its printed image and placement, the stage outlines its print.">select the target</button>
      {/if}
    {:else}
      <span class="small muted">none – read in the list only</span>
    {/if}
  </span></div>
{#if problems.length}<ul class="small danger problems">{#each problems as problem (problem)}<li>{problem}</li>{/each}</ul>{/if}
<div class="actions">
  <button type="button" class="text-link" onclick={revert} disabled={!dirty || saving}>Back to the draft</button>
  <span class="grow"></span>
  {#if notice}<span class="small muted">{notice}</span>{/if}
  {#if error}<span class="small danger">{error}</span>{/if}
  <button type="button" class="pill primary" onclick={save} disabled={!dirty || saving || problems.length > 0}>{saving ? "Saving…" : "Save"}</button>
</div>

<style>
  .row.top { align-items: start; }
  .row.top > .label { line-height: var(--control-height); }
  .row > .field { width: 100%; min-width: 0; }
  .w { width: 7rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .value { min-width: 0; overflow-wrap: anywhere; }
  textarea.body { height: auto; min-height: 8rem; padding: .375rem .5rem; resize: vertical; line-height: 1.4; }
  .preview { min-width: 0; padding: .375rem 0; overflow-wrap: anywhere; }
  .reader { border-left: 2px solid var(--line); padding-left: .5rem; line-height: 1.45; }
  .reader :global(p) { margin: 0 0 .5rem; }
  .reader :global(p + p) { text-indent: 2em; margin-top: -.25rem; }
  .reader :global(p:last-child) { margin-bottom: 0; }
  .reader :global(a) { color: inherit; }
  .vars { margin: .375rem 0 0; }
  .vars code { font-size: inherit; }
  .preview .danger { margin: .25rem 0 0; }
  .link { flex-wrap: nowrap; }
  .link .field { flex: 1; min-width: 0; }
  .problems { margin: .25rem 0 0; padding-left: 1rem; overflow-wrap: anywhere; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
