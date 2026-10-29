<script lang="ts">
  import { untrack } from "svelte";
  import { getBook } from "@engine/content/game-config";
  import { PASS_TYPES, PASSES, type PassData } from "@engine/types";
  import { putSpread } from "$lib/api";
  import { content } from "$lib/content.svelte";
  import type { Stage } from "$lib/stage/stage.svelte";
  import { passRows, passValue, setPassValue, type ValueRow } from "$lib/values";
  import ColourField from "$lib/components/ColourField.svelte";
  import ScrubNumber from "$lib/components/ScrubNumber.svelte";
  import Section from "$lib/components/Section.svelte";

  /**
   * The spread's **post-processing** (content schema 2.5): the passes over the rendered image in order – the built-in
   * bloom, vignette and grade with their rows from the contract's specs. Changes show live on the stage (under
   * *rendered*), the draft stays unchanged until **Save** writes the list to the spread. Without a list of its own the
   * spread shows the book's passes; *+ type* starts a list of its own, removing the last pass leaves an empty list
   * (none), **Back to the book's** drops the list. A collapsible section of the Stage panel; the passes' descriptions
   * are their help in the Info view.
   */
  let { stage, bookId, spreadId }: { stage: Stage | null; bookId: string; spreadId: string } = $props();

  const spread = $derived(content.spread(spreadId));
  /** The draft's list: the spread's own, or null = the book's apply */
  const draft = $derived<PassData[] | null>(spread?.passes ?? null);
  const bookPasses = $derived<PassData[]>(getBook().passes ?? []);

  let passes = $state<PassData[] | null>(null);
  /** The draft list the panel started from (by identity: a reload makes a new one) */
  let seen = $state<{ id: string; draft: PassData[] | null } | null>(null);
  let saving = $state(false);
  let saved = $state<string | null>(null);
  let error = $state<string | null>(null);

  const shown = $derived<PassData[]>(passes ?? bookPasses);
  const dirty = $derived(JSON.stringify(passes) !== JSON.stringify(draft));

  // A spread switch, the draft arriving or reloading: start from the draft – unless the same spread has unsaved edits
  $effect(() => {
    const id = spreadId;
    const d = draft;
    const previous = seen;
    if (previous && previous.id === id && previous.draft === d) return;
    const switching = !previous || previous.id !== id;
    // Edited = the panel's list differs from the draft it started from (not from the one arriving now)
    const edited = !!previous && JSON.stringify(untrack(() => passes)) !== JSON.stringify(previous.draft);
    seen = { id, draft: d };
    if (!switching && edited) return;
    passes = d ? d.map(p => ({ ...p })) : null;
    saved = null;
    error = null;
  });

  const apply = (next: PassData[] | null) => {
    passes = next;
    saved = null;
    stage?.overridePasses(next);
  };
  const set = (index: number, row: ValueRow, value: number | string) => {
    const list = passes ?? bookPasses.map(p => ({ ...p }));
    apply(list.map((pass, i) => (i === index ? setPassValue(pass, row, value) : pass)));
  };
  const add = (type: string) => apply([...(passes ?? bookPasses.map(p => ({ ...p }))), { type }]);
  const remove = (index: number) => apply((passes ?? bookPasses).filter((_, i) => i !== index));
  const revert = () => apply(draft ? draft.map(p => ({ ...p })) : null);
  const useBooks = () => apply(null);

  const save = async () => {
    if (!spread) return;
    saving = true;
    error = null;
    try {
      await putSpread(bookId, spreadId, { passes });
      // The draft reloads with the list; the stage builds the spread from it, so the live override goes
      stage?.overridePasses(null);
      await content.load(bookId);
      await stage?.refresh();
      saved = "Saved";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  };
</script>

{#snippet status()}
  <span class="small muted">{passes === null ? (bookPasses.length ? "the book's" : "none") : passes.length ? "this spread's" : "off"}</span>
{/snippet}
<Section id="stage.passes" label="post-processing" aside={status}
  help="The passes over the rendered image, in order. Changes show live on the stage (rendered shading); Save writes the list to the spread. Without a list of its own the spread uses the book's.">
{#each shown as pass, i (i)}
  <div class="row" data-help-name={pass.type} data-help={(PASSES as Record<string, { description: string }>)[pass.type]?.description ?? "A plugin's pass."}>
    <span class="label pass">{pass.type}</span>
    <span class="controls">
      <button type="button" class="text-link" onclick={() => remove(i)}>remove</button>
    </span></div>
  {#each passRows(pass, i) as row (row.id)}
    {@const name = row.id.split(".")[2]}
    <div class="row" class:changed={passValue(pass, row) !== (draft?.[i] ? passValue(draft[i], row) : row.default)} data-help-name="{pass.type} · {name}" data-help="{row.description} – default {row.default}">
      <span class="label sub">{name}</span>
      {#if row.kind === "color"}
        <ColourField value={String(passValue(pass, row))} label={row.id} onchange={hex => set(i, row, hex)} />
      {:else}
        <span class="w"><ScrubNumber value={Number(passValue(pass, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
          unit={row.unit ?? ""} label={row.id} strict={row.strict} oninput={v => set(i, row, v)} /></span>
      {/if}
    </div>
  {/each}
{/each}
<div class="row" data-help="Adds a pass at the end of the list; a spread without a list of its own starts one from the book's."><span class="label">add pass</span>
  <span class="controls">
    {#each PASS_TYPES as type (type)}
      <button type="button" class="pill" onclick={() => add(type)}>+ {type}</button>
    {/each}
  </span></div>
{#if dirty || saved || error}
  <div class="actions">
    <button type="button" class="text-link" onclick={revert} disabled={!dirty}>Back to the draft</button>
    {#if passes !== null && bookPasses.length}<button type="button" class="text-link" onclick={useBooks}>Use the book's</button>{/if}
    <span class="grow"></span>
    {#if saved}<span class="small muted">{saved}</span>{/if}
    {#if error}<span class="small danger">{error}</span>{/if}
    <button type="button" class="pill primary" onclick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</button>
  </div>
{/if}
</Section>

<style>
  .w { width: 6rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .label.sub { padding-left: 1rem; }
  .label.pass { color: var(--text); }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
