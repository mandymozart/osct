<script lang="ts">
  import { untrack } from "svelte";
  import { PASS_TYPES, PASSES, type PassData } from "@engine/types";
  import { putBookPasses, putSpread } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import {
    backToBooks, draftPasses, editInEffect, effectivePasses, ownPasses, passesSource, passesStatus, pendingSaves,
    type PassesDraft, type PassesSource,
  } from "#lib/passes-edit.js";
  import { helpName, passOptionLabels, passRows, passValue, setPassValue, type ValueRow } from "#lib/values.js";
  import ColourField from "#lib/components/ColourField.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Section from "#lib/components/Section.svelte";

  /**
   * The **post-processing** (content schema 2.5): the passes over the rendered image in order – the built-in bloom,
   * vignette and grade with their rows from the contract's specs. The book's passes are the master every spread shows;
   * a spread uses them until it has **own** passes (an override, starting as a copy of the book's; an empty list turns
   * them off there), *the book's* drops the override again. The list shown is the one in effect – while the spread uses
   * the book's, editing it edits the book's (every spread without its own). Changes show live on the stage (under
   * *rendered*), the draft stays unchanged until **Save** writes what changed: the book's list
   * (`PUT …/passes`) and / or the spread's (`PUT …/spreads/{id}`). A collapsible section of the Stage panel; the
   * passes' descriptions are their help in the Info view.
   */
  let { stage, bookId, spreadId }: { stage: Stage | null; bookId: string; spreadId: string } = $props();

  const SOURCES = ["book", "spread"] as const satisfies readonly PassesSource[];

  const spread = $derived(content.spread(spreadId));
  /** The draft's lists: the book's (the master) and the spread's own (null = the book's apply) */
  const saved = $derived<PassesDraft>(draftPasses(content.bookPasses, spread?.passes));

  let edit = $state<PassesDraft>({ book: [], own: null });
  /** The draft lists the panel started from (by identity: a reload makes new ones) */
  let seen = $state<{ id: string; book: PassData[] | null; own: PassData[] | undefined; draft: PassesDraft } | null>(null);
  let saving = $state(false);
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);

  const shown = $derived<PassData[]>(effectivePasses(edit));
  const source = $derived<PassesSource>(passesSource(edit));
  const pending = $derived(pendingSaves(edit, saved));
  const pendingWhat = $derived((["book", "spread"] as const).filter(key => key in pending).map(key => (key === "book" ? "the book's" : "this spread's")).join(" + "));
  const dirty = $derived(pendingWhat !== "");
  /** The list in effect as the draft holds it – what a changed row is compared with */
  const savedShown = $derived<PassData[]>(source === "book" ? saved.book : saved.own ?? saved.book);

  // A spread switch, the draft arriving or reloading: start from the draft – unless the same spread has unsaved edits
  $effect(() => {
    const id = spreadId;
    const book = content.bookPasses;
    const own = spread?.passes;
    const previous = seen;
    if (previous && previous.id === id && previous.book === book && previous.own === own) return;
    const switching = !previous || previous.id !== id;
    // Edited = the panel's lists differ from the draft they started from (not from the one arriving now)
    const edited = !!previous && JSON.stringify(untrack(() => edit)) !== JSON.stringify(previous.draft);
    seen = { id, book, own, draft: draftPasses(book, own) };
    if (!switching && edited) return;
    edit = draftPasses(book, own);
    notice = null;
    error = null;
    // A live preview belongs to the spread it was made on
    if (previous && switching) untrack(() => stage)?.overridePasses(null);
  });

  const apply = (next: PassesDraft) => {
    edit = next;
    notice = null;
    stage?.overridePasses($state.snapshot(effectivePasses(next)) as PassData[]);
  };
  const set = (index: number, row: ValueRow, value: number | string) =>
    apply(editInEffect(edit, list => list.map((pass, i) => (i === index ? setPassValue(pass, row, value) : pass))));
  const add = (type: string) => apply(editInEffect(edit, list => [...list, { type }]));
  const remove = (index: number) => apply(editInEffect(edit, list => list.filter((_, i) => i !== index)));
  const choose = (next: PassesSource) => {
    if (next !== source) apply(next === "spread" ? ownPasses(edit) : backToBooks(edit));
  };
  const revert = () => {
    edit = draftPasses(content.bookPasses, spread?.passes);
    notice = null;
    stage?.overridePasses(null);
  };

  const save = async () => {
    if (!spread) return;
    saving = true;
    error = null;
    try {
      const todo = $state.snapshot(pending) as ReturnType<typeof pendingSaves>;
      if ("book" in todo) await putBookPasses(bookId, todo.book ?? null);
      if ("spread" in todo) await putSpread(bookId, spreadId, { passes: todo.spread ?? null });
      // The draft reloads with the lists; the stage builds the spread from it, so the live override goes
      stage?.overridePasses(null);
      await content.load(bookId);
      await stage?.refresh();
      notice = "Saved";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  };
</script>

{#snippet status()}
  <span class="small muted">{passesStatus(edit)}</span>
{/snippet}
<Section id="stage.passes" label="post-processing" aside={status}
  help="The passes over the rendered image, in order – the look-around world and its sky included. The book's passes are the master every spread shows; a spread may have its own instead. Changes show live on the stage (rendered shading); Save writes them to the draft.">
<div class="row" data-help="Which passes this spread shows. The book's: the book's own list, the master every spread without a list of its own shows – the list below is then the book's, and editing it changes every such spread. Own: an override for this spread alone, starting as a copy of the book's; removing every pass turns post-processing off here. Choosing the book's again drops the override.">
  <span class="label">uses</span>
  <span class="controls">
    <Segmented options={SOURCES} value={source} labels={{ book: "the book's", spread: "own" }}
      titles={{ book: "Back to the book's", spread: "Own passes for this spread" }} onchange={choose} />
  </span></div>
{#each shown as pass, i (i)}
  <div class="row" data-help-name={pass.type} data-help={(PASSES as Record<string, { description: string }>)[pass.type]?.description ?? "A plugin's pass."}>
    <span class="label pass">{pass.type}</span>
    <span class="controls">
      <button type="button" class="text-link" onclick={() => remove(i)}>remove</button>
    </span></div>
  {#each passRows(pass, i) as row (row.id)}
    <!-- The parameter's words (#173): its spec's label, else its name split into words -->
    <div class="row" class:changed={passValue(pass, row) !== (savedShown[i]?.type === pass.type ? passValue(savedShown[i], row) : row.default)} data-help-name="{pass.type} · {helpName(row)}" data-help="{row.description} – default {row.default}">
      <span class="label sub">{row.label}</span>
      {#if row.kind === "choice"}
        <span class="controls"><Segmented options={row.options ?? []} value={String(passValue(pass, row))} labels={passOptionLabels(pass, row)} onchange={v => set(i, row, v)} /></span>
      {:else if row.kind === "color"}
        <ColourField value={String(passValue(pass, row))} label={row.label} onchange={hex => set(i, row, hex)} />
      {:else}
        <span class="w"><ScrubNumber value={Number(passValue(pass, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
          unit={row.unit ?? ""} label={row.label} strict={row.strict} oninput={v => set(i, row, v)} /></span>
      {/if}
    </div>
  {/each}
{/each}
<div class="row" data-help="Adds a pass at the end of the list in effect: the book's while the spread uses them, else the spread's own."><span class="label">add pass</span>
  <span class="controls">
    {#each PASS_TYPES as type (type)}
      <button type="button" class="pill" onclick={() => add(type)}>+ {type}</button>
    {/each}
  </span></div>
{#if dirty || notice || error}
  <div class="actions">
    <button type="button" class="text-link" onclick={revert} disabled={!dirty}>Back to the draft</button>
    <span class="grow"></span>
    {#if dirty}<span class="small muted">{pendingWhat}</span>{/if}
    {#if notice}<span class="small muted">{notice}</span>{/if}
    {#if error}<span class="small danger">{error}</span>{/if}
    <button type="button" class="pill primary" onclick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</button>
  </div>
{/if}
</Section>

<style>
  .w { width: 6rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .label.sub { padding-left: .5rem; }
  .label.pass { color: var(--text); }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
