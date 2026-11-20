<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { autosave } from "#lib/autosave.svelte.js";
  import { baselineOf, differsFromBaseline, noteBaseline } from "#lib/baselines.js";
  import { ENTRY_CATEGORIES } from "@shared/types/entry";
  import { CATEGORY_LABELS } from "#lib/new-target.js";
  import { exprMessage, renderEntryText, textVariables, variablesOf } from "@shared/text/entry-text";
  import { putEntry, type EditorEntry, type EntrySaved } from "#lib/api.js";
  import { draftOf, draftProblems, entryChanges, imageUrl, type EntryDraft } from "#lib/entry-edit.js";
  import { entryLink } from "#lib/entry-view.js";
  import { entries } from "#lib/entries.svelte.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import { sceneName } from "#lib/scene-strip.js";
  import { surfaceChoices } from "#lib/surface-edit.js";
  import { library } from "#lib/library.svelte.js";
  import { pickAccept, type LibraryPick } from "#lib/library-pick.js";
  import { trackUnsaved } from "#lib/unsaved.js";
  import FileField from "#lib/components/FileField.svelte";
  import MediaLevels from "#lib/components/MediaLevels.svelte";
  import { makeImageLevels, withLevel, withoutLevel } from "#lib/media-levels.js";
  import Segmented from "#lib/components/Segmented.svelte";

  /**
   * An entry's form (#223), in the Inspector's place of the entry the tree selects and on the Entries page: the title,
   * category, its scene (and surface, in a scene of several), the author and tags, the text with its live preview, the picture from the Library and its
   * caption (#289), a link's URL and the target. The preview is the reader's renderer (`renderEntryText`: Markdown with the experience's
   * variables) – on the stage with the variables' current values, elsewhere with none set; the variables the text reads
   * are listed with their values, what does not parse below. Edits reach the draft by themselves a moment after the
   * last one (#259: only the fields that changed, `PUT …/entries/{id}`) – the form keeps what was typed, a save never
   * writes over it; an entry with a problem (an empty title) waits until it is solved. *Undo edits* goes back to the
   * entry as the draft had it before its first edit in this page.
   */
  let { experienceId, entry, assetsBase = null, vars = null, onpick, onsaved, onselecttarget }: {
    experienceId: string;
    entry: EditorEntry;
    /** Where the content's paths resolve (the picture's preview) */
    assetsBase?: string | null;
    /** The stage's variables in their scopes; null: no stage – every variable shows as not set */
    vars?: ReadonlyArray<{ scope: string; name: string; value: unknown }> | null;
    /** Open the Library as a picker for the picture (the host shows it in this place) */
    onpick?: (pick: Omit<LibraryPick, "oncancel">) => void;
    /** After a save: the draft changed (reload it; a new scene may have moved the entry) – `changes`: the fields written */
    onsaved?: (saved: EntrySaved, changes: Record<string, unknown>) => void | Promise<void>;
    onselecttarget?: (targetId: string) => void;
  } = $props();

  let draft = $state<EntryDraft>(untrack(() => draftOf(entry)));
  let editing = $state(untrack(() => entry.id));
  /** The entry was edited in this form: what was typed stays as typed, whatever a save answers */
  let touched = false;
  let notice = $state<string | null>(null);

  // Another entry: the form starts from it. The same entry read again (a save, a reload): only a form nobody typed in follows
  $effect(() => {
    const e = entry;
    untrack(() => {
      if (editing === e.id && touched) return;
      if (editing !== e.id) {
        notice = null;
        touched = false;
      }
      editing = e.id;
      draft = draftOf(e);
    });
  });

  // The selection may move on (the experience, another scene) a moment before the Inspector drops this form: no entry, no changes
  const changes = $derived(entry ? entryChanges(entry, draft) : {});
  const dirty = $derived(Object.keys(changes).length > 0);
  const problems = $derived(draftProblems(draft));
  // Typed, not in the draft yet (a problem keeps it back): a reload would lose it
  onMount(() => trackUnsaved(() => dirty));
  /** The entry as a subject of the autosaver and of *Undo edits* */
  const key = $derived(`entry:${experienceId}:${entry?.id}`);
  const canUndo = $derived(differsFromBaseline(key, draft));

  const lookup = $derived(variablesOf(vars ?? []));
  const rendered = $derived(renderEntryText(draft.body, { variables: lookup }));
  const used = $derived(textVariables(draft.body).map(name => ({ name, value: lookup(name) })));
  const textProblems = $derived(rendered.problems.filter(p => p.code !== "missing-value"));
  const link = $derived(entryLink(draft.media));
  const imageSrc = $derived(draft.image ? imageUrl(draft.image, assetsBase) : "");

  /** An edit: in the preview at once, in the draft a moment after the last one – unless a problem keeps it back */
  const edit = (patch: Partial<EntryDraft>) => {
    const experience = experienceId;
    const id = entry.id;
    const subject = key;
    const typed: EntryDraft = { ...draft, ...patch };
    noteBaseline(subject, draftOf(entry));
    draft = typed;
    touched = true;
    notice = null;
    const [problem] = draftProblems(typed);
    if (problem) return autosave.hold(subject, problem);
    const done = onsaved;
    autosave.queue(subject, async () => {
      // What differs from the entry as the draft holds it when the save runs (an earlier save may have changed it)
      const stored = entries.byId(id);
      const fields = stored ? entryChanges(stored, typed) : {};
      if (!Object.keys(fields).length) return;
      const saved = await putEntry(experience, id, fields);
      entries.saved(saved.entry);
      if (saved.entry.scene !== saved.previousScene) notice = `Now on ${sceneNameOf(saved.entry.scene)}`;
      await done?.(saved, fields);
    });
  };
  /** Undo edits: the entry as the draft had it before its first edit in this page – saved like any edit */
  const revert = () => {
    const before = baselineOf<EntryDraft>(key);
    if (before) edit(before);
  };
  const pickImage = () =>
    onpick?.({ subject: { for: "entry-image" }, label: `the picture of ${entry.title}`, current: draft.image || undefined, onpick: asset => edit({ image: asset.url }) });
  const upload = async (file: File) => {
    try {
      // Named by the entry (`p118-1_image.webp`, #298)
      edit({ image: (await library.upload(experienceId, file, { fit: "entryImage", entry: entry.id })).url });
    } catch {
      // library.error says
    }
  };
  // ── the picture's levels (#331 step 3): the reader's media quality chooses one; smaller ones computed in the browser ──
  let levelError = $state<string | null>(null);
  let levelBusy = $state<string | null>(null);
  const setLevel = (level: number, url: string) => edit({ imageLevels: withLevel(draft.imageLevels, level, url) });
  const pickLevel = (level: number) =>
    onpick?.({ subject: { for: "entry-image" }, label: `the ${level} px level of the picture of ${entry.title}`, onpick: asset => setLevel(level, asset.url) });
  const uploadLevel = async (level: number, file: File) => {
    levelBusy = `uploading ${file.name}…`;
    try {
      setLevel(level, (await library.upload(experienceId, file, { fit: "entryImage", entry: entry.id })).url);
    } catch {
      // library.error says
    } finally {
      levelBusy = null;
    }
  };
  /** The levels below the largest one (or the picture itself when it has none), computed here in the browser */
  const computeLevels = async () => {
    const top = draft.imageLevels.at(-1);
    const src = top?.src ?? draft.image;
    if (!src) return;
    levelError = null;
    levelBusy = "reading the picture…";
    try {
      const response = await fetch(imageUrl(src, assetsBase));
      if (!response.ok) throw new Error(`the picture could not be read (${response.status})`);
      const have = draft.imageLevels.map(entry => entry.level);
      const made = await makeImageLevels(await response.blob(), library.byUrl(src)?.name ?? src.replace(/^.*\//, ""), have, level => (levelBusy = `computing ${level} px…`));
      let levels = top ? draft.imageLevels : withLevel(draft.imageLevels, made.level, src);
      for (const level of made.levels) {
        levelBusy = `uploading ${level.level} px…`;
        levels = withLevel(levels, level.level, (await library.upload(experienceId, level.file, { fit: "entryImage", entry: entry.id })).url);
      }
      if (JSON.stringify(levels) !== JSON.stringify(draft.imageLevels)) edit({ imageLevels: levels });
      else levelError = "Nothing to compute: the smaller levels are there.";
    } catch (e) {
      levelError = e instanceof Error ? e.message : String(e);
    } finally {
      levelBusy = null;
    }
  };
  const shown = (value: unknown): string => (typeof value === "string" ? `"${value}"` : String(value));
  // The scenes the entry may be on (the experience's tree) and the surfaces of the chosen one
  $effect(() => {
    if (scenes.experienceId !== experienceId) void scenes.load(experienceId);
  });
  const sceneNameOf = (id: string): string => {
    const scene = scenes.scene(id);
    return scene ? sceneName(scene) : id;
  };
  const surfaceOptions = $derived(surfaceChoices(scenes.scene(draft.scene)?.surfaces));
  /** Another scene: the surface goes (it named one of the scene it left) */
  const moveTo = (scene: string) => edit({ scene, surface: "" });
  const scopeOf = (name: string): string | undefined => {
    const order = ["scene", "stage", "session", "experience"];
    return (vars ?? []).filter(v => v.name === name).sort((a, b) => order.indexOf(a.scope) - order.indexOf(b.scope))[0]?.scope;
  };
</script>

<div class="section" data-help-name="Entry" data-help="The entry as the reader reads it in the list: its fields, its text, its picture and link, and its target. Edits show in the preview at once and reach the draft by themselves, a moment after the last change.">
  <span class="section-label">entry · {entry.title}</span>
  <span class="small muted">on {sceneNameOf(entry.scene)}</span>
</div>
<div class="row" class:changed={"title" in changes}><span class="label">title</span>
  <input class="field" value={draft.title} aria-label="Title" oninput={e => edit({ title: e.currentTarget.value })} data-help="The entry's name – the list and the entry's head show it." /></div>
<div class="row" class:changed={"category" in changes}><span class="label">category</span>
  <span class="controls"><Segmented options={ENTRY_CATEGORIES} value={draft.category as (typeof ENTRY_CATEGORIES)[number]} labels={CATEGORY_LABELS} label="Category" onchange={category => edit({ category })} /></span></div>
<div class="row" class:changed={"scene" in changes} data-help-name="Scene" data-help="The scene the entry belongs to – where the reader finds it; the list names the scene's label. Another scene moves the entry there.">
  <span class="label">scene</span>
  <select class="field" aria-label="Scene" value={draft.scene} onchange={e => moveTo(e.currentTarget.value)}>
    {#if !scenes.scene(draft.scene)}<option value={draft.scene}>{draft.scene}</option>{/if}
    {#each scenes.list as scene (scene.id)}<option value={scene.id}>{sceneName(scene)}</option>{/each}
  </select></div>
{#if surfaceOptions.length > 1}
  <div class="row" class:changed={"surface" in changes} data-help-name="Surface" data-help="The surface of the scene the entry lies on – the reader's list names its label, else the scene's. None: the scene as a whole.">
    <span class="label">surface</span>
    <span class="controls"><Segmented options={["", ...surfaceOptions.map(c => c.value)]} value={draft.surface} labels={{ "": "none", ...Object.fromEntries(surfaceOptions.map(c => [c.value, c.label])) }} label="Surface" onchange={surface => edit({ surface })} /></span></div>
{/if}
<div class="row" class:changed={"author" in changes}><span class="label">author</span>
  <input class="field" value={draft.author} aria-label="Author" placeholder="none" oninput={e => edit({ author: e.currentTarget.value })} data-help="Who wrote the text – the reader shows it for texts." /></div>
<div class="row" class:changed={"tags" in changes}><span class="label">tags</span>
  <input class="field" value={draft.tags} aria-label="Tags" placeholder="none – words, separated by commas" oninput={e => edit({ tags: e.currentTarget.value })} data-help="Words that describe the entry, separated by commas." /></div>
<div class="row top" class:changed={"body" in changes}><span class="label">text</span>
  <textarea class="field body" rows="8" value={draft.body} aria-label="Text" spellcheck="true" oninput={e => edit({ body: e.currentTarget.value })}
    data-help-name="Text" data-help="Markdown: a blank line starts a paragraph, *emphasis*, **strong**, [a link](https://…). The experience's variables in braces: {'{hasKey}'} prints a value, {'{hasKey: the door opens|it is locked}'} chooses a text – a variable that is not set shows as nothing, so the part after | is its fallback. A backslash before a brace writes the brace."></textarea></div>
<div class="row top"><span class="label">preview</span>
  <div class="preview" data-help-name="Preview" data-help="The text as the reader shows it – the reader's own renderer. On the stage the variables have their current values (set them in the scene's vars and events); on the Entries page none is set.">
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
  <div class="row"><span class="label"></span><span class="controls"><button type="button" class="text-link" onclick={() => edit({ image: "", imageLevels: [] })}>remove the picture</button></span></div>
  <MediaLevels kind="image" levels={draft.imageLevels} accept={pickAccept({ for: "entry-image" })} error={levelError} busy={levelBusy}
    onupload={(level, file) => void uploadLevel(level, file)} onlibrary={pickLevel}
    onremove={level => edit({ imageLevels: withoutLevel(draft.imageLevels, level) ?? [] })} oncompute={() => void computeLevels()} />
{/if}
<div class="row" class:changed={"caption" in changes}><span class="label">caption</span>
  <input class="field" value={draft.caption} aria-label="Caption" placeholder="none – Image: … by …" oninput={e => edit({ caption: e.currentTarget.value })}
    data-help-name="Caption" data-help="The line under the picture in the reader, in small type – e.g. Image: anatomical illustration by … It is the entry's own text; a file's credit line is set in the Library." /></div>
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
  <button type="button" class="text-link" onclick={revert} disabled={!canUndo} data-help-name="Undo edits"
    data-help="Edits reach the draft by themselves, a moment after the last change. Undo edits takes the entry back to how the draft had it before its first edit since this page was opened.">Undo edits</button>
  <span class="grow"></span>
  {#if notice}<span class="small muted">{notice}</span>{/if}
</div>

<style>
  .row.top { align-items: start; }
  .row.top > .label { line-height: var(--control-height); }
  .row > .field { width: 100%; min-width: 0; }
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
