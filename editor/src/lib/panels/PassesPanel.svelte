<script lang="ts">
  import { untrack } from "svelte";
  import { passBudgetWarning, type PassData } from "@engine/types";
  import { errorText, putBookPasses, putSpread } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import {
    backToBooks, draftPasses, editInEffect, effectivePasses, levelLine, movePass, ownPasses, passesHeading, passesSource, pendingSaves,
    saveLabel, spreadsOnBooks, type PassesDraft, type PassesSource,
  } from "#lib/passes-edit.js";
  import { livePassGroups, passPluginOf, passSpecOf } from "#lib/plugin-passes.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { helpName, passOptionLabels, passRows, passValue, setPassValue, type ValueRow } from "#lib/values.js";
  import ColourField from "#lib/components/ColourField.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Section from "#lib/components/Section.svelte";
  import TextureField from "#lib/components/TextureField.svelte";

  /**
   * The **post-processing**: the passes over the rendered image in order – the built-in bloom,
   * vignette and grade, and (#216) the passes of the book's plugins, each with its rows from its spec. The
   * book's passes are the master every spread shows; a spread uses them until it has its **own** (an override, starting
   * as a copy of the book's; an empty list turns them off there), *back to the book's* drops the override again. The list
   * shown is the one in effect – while the spread uses the book's, editing it edits the book's (every spread without its
   * own). The level is unmistakable (#181): the head names it ("post-processing · the whole book" / "· only this spread"),
   * the line under it says what editing changes (all N spreads that use the book's, or this spread's override) with the
   * switch to the other, and Save says what it saves. A pass moves up and down in the list or goes. *add pass* offers the
   * built-in passes and each plugin's under its id – the declared plugins' (recorded, or loaded on the stage) and a plugin
   * run in the Code tab at once (`plugins.version`). A list beyond the phone budget says so (#86). Changes show live on
   * the stage (under *rendered*), the draft stays unchanged until **Save** writes what changed: the book's list
   * (`PUT …/passes`) and / or the spread's (`PUT …/spreads/{id}`). A collapsible section of the Inspector's spread view,
   * closed on the first visit; the passes' descriptions are their help in the Info view.
   */
  let { stage, bookId, spreadId }: { stage: Stage | null; bookId: string; spreadId: string } = $props();

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
  const dirty = $derived(Object.keys(pending).length > 0);
  /** The spreads editing the book's list changes: every one without a list of its own, this one as it stands now */
  const onBooks = $derived(spreadsOnBooks(content.spreads, spreadId, edit.own));
  /** The list in effect as the draft holds it – what a changed row is compared with */
  const savedShown = $derived<PassData[]>(source === "book" ? saved.book : saved.own ?? saved.book);
  /** What *add pass* offers, grouped: built in, then each plugin's (a Code tab Run adds its passes at once) */
  const groups = $derived.by(() => { void plugins.version; void content.bookPasses; return livePassGroups(); });
  /** Per pass shown: its rows, the plugin it belongs to and its description (the registry follows a Run) */
  const passes = $derived.by(() => {
    void plugins.version;
    return shown.map((pass, i) => ({
      pass,
      rows: passRows(pass, i),
      plugin: passPluginOf(pass.type),
      description: passSpecOf(pass.type)?.description,
    }));
  });
  const budget = $derived(passBudgetWarning(shown));

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
  const move = (index: number, by: number) => apply(editInEffect(edit, list => movePass(list, index, by)));
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
      error = errorText(e);
    } finally {
      saving = false;
    }
  };
</script>

<Section id="stage.passes" label={passesHeading(edit)} open={false}
  help="The passes over the rendered image, in order – the look-around world and its sky included: the built-in ones and the passes of the book's plugins. The head names the level: the whole book – the book's passes, the master every spread without its own shows – or only this spread – an override of its own. Changes show live on the stage (rendered shading); Save writes them to the draft.">
<div class="level" data-help-name="Level" data-help={source === "book"
  ? "The list below is the book's: editing it changes every spread without passes of its own (counted here, this one included). Own for this spread gives this spread an override of its own, starting as a copy of the book's."
  : "The list below is this spread's own: it overrides the book's here alone; removing every pass turns post-processing off here. Back to the book's drops the override – the spread shows the book's passes again."}>
  <span class="small">{levelLine(edit, onBooks)}</span>
  <span class="grow"></span>
  {#if source === "book"}
    <button type="button" class="text-link" title="Own passes for this spread, starting as a copy of the book's" onclick={() => choose("spread")}>own for this spread</button>
  {:else}
    <button type="button" class="text-link" title="Drop this spread's override: it shows the book's passes again" onclick={() => choose("book")}>back to the book's</button>
  {/if}
</div>
{#each passes as { pass, rows, plugin, description }, i (i)}
  <div class="row" data-help-name={plugin ? `${pass.type} · ${plugin}` : pass.type}
    data-help={description ? (plugin ? `${description} – a pass of the plugin ${plugin}.` : description) : "A plugin's pass that no plugin of the book registers here – Run its plugin in the Code tab, or remove it."}>
    <span class="label pass">{pass.type}</span>
    <span class="controls">
      {#if plugin}<span class="small muted plugin" title="A pass of the plugin {plugin}">{plugin}</span>{/if}
      <button type="button" class="icon-button" aria-label="Move {pass.type} up" title="Earlier in the chain" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="up" /></button>
      <button type="button" class="icon-button" aria-label="Move {pass.type} down" title="Later in the chain" disabled={i === passes.length - 1} onclick={() => move(i, 1)}><Icon name="down" /></button>
      <button type="button" class="text-link" onclick={() => remove(i)}>remove</button>
    </span></div>
  {#each rows as row (row.id)}
    <!-- The parameter's words (#173): its spec's label, else its name split into words -->
    <div class="row" class:changed={passValue(pass, row) !== (savedShown[i]?.type === pass.type ? passValue(savedShown[i], row) : row.default)} data-help-name="{pass.type} · {helpName(row)}" data-help="{row.description} – default {row.default === '' ? 'none' : row.default}">
      <span class="label sub">{row.label}</span>
      {#if row.kind === "choice"}
        <span class="controls"><Segmented options={row.options ?? []} value={String(passValue(pass, row))} labels={passOptionLabels(pass, row)} onchange={v => set(i, row, v)} /></span>
      {:else if row.kind === "boolean"}
        {@const on = passValue(pass, row) === "true"}
        <span class="controls"><button type="button" class="pill" class:on aria-pressed={on} onclick={() => set(i, row, on ? "false" : "true")}>{on ? "on" : "off"}</button></span>
      {:else if row.kind === "string"}
        <input class="field" value={String(passValue(pass, row))} aria-label={row.label} oninput={e => set(i, row, (e.currentTarget as HTMLInputElement).value)} />
      {:else if row.kind === "texture"}
        <TextureField value={String(passValue(pass, row))} label={row.label} onchange={v => set(i, row, v)} />
      {:else if row.kind === "color"}
        <ColourField value={String(passValue(pass, row))} label={row.label} onchange={hex => set(i, row, hex)} />
      {:else}
        <span class="w"><ScrubNumber value={Number(passValue(pass, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
          unit={row.unit ?? ""} label={row.label} strict={row.strict} oninput={v => set(i, row, v)} /></span>
      {/if}
    </div>
  {/each}
{/each}
{#if budget}
  <div class="row" data-help-name="Phone budget" data-help="Every pass is a full-screen render on the phone, a bloom several: up to three passes and one bloom fit (#86). The content build warns too."><span class="small muted">{budget}</span></div>
{/if}
{#each groups as group, g (group.label)}
  <div class="row" data-help={group.plugin
    ? `Adds a pass of the plugin ${group.plugin} at the end of the list in effect: the book's while the spread uses them, else the spread's own.`
    : "Adds a pass at the end of the list in effect: the book's while the spread uses them, else the spread's own."}>
    <span class="label">{g === 0 ? "add pass" : ""}{#if group.plugin}<span class="muted">{g === 0 ? " · " : ""}{group.label}</span>{/if}</span>
    <span class="controls">
      {#each group.choices as choice (choice.type)}
        <button type="button" class="pill" title={choice.spec.description} onclick={() => add(choice.type)}>+ {choice.type}</button>
      {/each}
    </span></div>
{/each}
{#if dirty || notice || error}
  <div class="actions">
    <button type="button" class="text-link" onclick={revert} disabled={!dirty}>Back to the draft</button>
    <span class="grow"></span>
    {#if notice}<span class="small muted">{notice}</span>{/if}
    {#if error}<span class="small danger">{error}</span>{/if}
    <button type="button" class="pill primary" onclick={save} disabled={!dirty || saving}>{saving ? "Saving…" : saveLabel(pending)}</button>
  </div>
{/if}
</Section>

<style>
  .w { width: 6rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .label.sub { padding-left: .5rem; }
  .label.pass { color: var(--text); }
  .plugin { margin-right: auto; }
  .level { display: flex; flex-wrap: wrap; align-items: center; gap: 0 .5rem; min-height: var(--control-height); flex-shrink: 0; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
