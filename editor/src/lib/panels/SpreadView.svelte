<script lang="ts">
  import { errorText, putSpread } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import Segmented from "#lib/components/Segmented.svelte";
  import Section from "#lib/components/Section.svelte";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import { formatElapsed } from "#lib/stage/event-log.js";
  import { formatVar, initialValue, numberStep, tapTargets, VAR_TYPES, withTypes, type VarType } from "#lib/stage/narrative.js";
  import { VAR_SCOPES, type VarScope, type VarValue } from "@engine/scene/plugin-runtime";
  import PassesPanel from "./PassesPanel.svelte";
  import { stageEnvironment } from "#lib/environment.svelte.js";
  import { library } from "#lib/library.svelte.js";
  import { environmentSkyLabel } from "#lib/stage/sky.js";
  import { passesState, spreadPages } from "#lib/spread-view.js";

  /**
   * The **spread** in the Inspector (#229 – the Stage tab's until then): what the Inspector shows while the spread is
   * selected – the tree's top row, a click on the stage that picks nothing, a fresh workspace. Collapsible sections
   * (open state kept per section): the **spread** – its title, pages, format, the post-processing in effect and the
   * book's environment, open on a first visit –, the **post-processing** (the book's passes, a spread's own as an
   * override – its head names the level), and the **narrative** of the book's plugins: a tap button per target (the
   * reader's tap without aiming), the variables with scope and type, editable and deletable, a form to set one by hand
   * (both written through the plugin API), *reset* for a new game, and the stage's event timeline (time since the
   * spread opened, event, payload) with *clear*. How the stage shows the spread – shake, origin, the desk's top, the
   * sky – is the toolbar's *view* group (`ViewMenu.svelte`), the grid its *grid & snap* group. The camera is moved on
   * the stage itself; found / lost per target is the tree's eye, the first find is replayed from the stage's menu.
   * Explanations are the controls' help in the Info view.
   */
  let { stage, bookId, spreadId, onenvironment }: {
    stage: Stage | null; bookId: string; spreadId: string;
    /** The environment row's link: the workspace opens the Environment tab */
    onenvironment?: () => void;
  } = $props();

  const spread = $derived(content.spread(spreadId));
  /** The spread's format (content schema 2.3): a double page, the front cover or the back cover – the stage follows */
  const FORMATS = ["spread", "cover", "back"] as const;
  const singlePage = $derived(!!spread && spread.firstPage === spread.lastPage);
  let formatError = $state<string | null>(null);
  const setFormat = async (format: (typeof FORMATS)[number]) => {
    formatError = null;
    try {
      await putSpread(bookId, spreadId, { format });
      await content.load(bookId);
      await stage?.refresh();
      stage?.relayout();
    } catch (e) {
      formatError = errorText(e);
    }
  };
  const format = $derived(spread?.format ?? "spread");

  /** The book's environment (#185): the spread section names it */
  const environment = $derived(stageEnvironment.current);

  const vars = $derived(withTypes(stage?.vars ?? []));
  const events = $derived(stage?.events ?? []);
  /** A target takes a tap when it is found and shows AR content (the stage's live tree: an override, or the draft's) */
  const taps = $derived(tapTargets(spread?.entries ?? [], stage?.found ?? [], target => !!stage?.treeOf(target.id)));

  let varError = $state<string | null>(null);
  let newName = $state("");
  let newScope = $state<VarScope>("spread");
  let newType = $state<VarType>("boolean");
  let newValue = $state<VarValue>(initialValue("boolean"));
  /** Write a variable through the plugin API (null deletes); true when it was written */
  const write = (name: string, value: VarValue | null, scope: VarScope): boolean => {
    varError = stage ? stage.setVar(name, value, scope) : "the stage is not running";
    return varError === null;
  };
</script>

<Section id="stage.spread" label="spread" summary={spread ? `${spread.title} · ${format}` : undefined}
  help="The spread the stage shows: its title and pages, its format (saved to the draft), the post-processing in effect and the book's environment. The Inspector shows the spread while it is selected – a tap on the tree's top row, a click on the stage that picks nothing – and when the workspace opens.">
  <div class="row" data-help="The spread's title in the book.">
    <span class="label">title</span>
    <span class="value">{spread?.title ?? spreadId}</span></div>
  <div class="row" data-help="The book's pages this spread shows – a cover has its face only.">
    <span class="label">pages</span>
    <span class="value">{spread ? spreadPages(spread) : ""}</span></div>
  <div class="row" data-help="What this spread is: a double page, the front cover or the back cover. Only a one-page spread can be a cover; the stage shows the closed book for one.">
    <span class="label">format</span>
    <span class="controls">
      <select class="field" aria-label="Spread format" value={spread?.format ?? "spread"} disabled={!singlePage}
        onchange={e => void setFormat((e.currentTarget as HTMLSelectElement).value as (typeof FORMATS)[number])}>
        {#each FORMATS as f (f)}<option value={f}>{f}</option>{/each}
      </select>
      {#if formatError}<span class="small danger">{formatError}</span>{/if}
    </span></div>
  <div class="row" data-help="The post-processing in effect on this spread: the book's passes (the whole book) or its own (only this spread), and which passes. They are edited in the post-processing section below.">
    <span class="label">passes</span>
    <span class="value">{passesState(content.bookPasses, spread?.passes)}</span></div>
  <div class="row" data-help="The world around the reader and its sky: the book's environment, or none – then the stage's HDRI is the sky. It is edited in the Environment tab.">
    <span class="label">environment</span>
    <span class="controls">
      <span class="value">{environment ? environmentSkyLabel(environment, url => library.byUrl(url)?.name) : "none – the stage's HDRI"}</span>
      {#if onenvironment}<button type="button" class="text-link" onclick={onenvironment} data-help-name="Environment tab" data-help="Opens the Environment tab, where the book's environment is set.">edit</button>{/if}
    </span></div>
</Section>

<PassesPanel {stage} {bookId} {spreadId} />

{#snippet valueControl(type: VarType, value: VarValue, label: string, commit: (value: VarValue) => void)}
  {#if type === "boolean"}
    <Segmented options={["false", "true"] as const} value={value === true ? "true" : "false"} onchange={v => commit(v === "true")} />
  {:else if type === "number"}
    <span class="w"><ScrubNumber value={Number(value)} step={numberStep(Number(value))} {label} onchange={commit} /></span>
  {:else}
    <input class="field text" aria-label={label} value={formatVar(value)} onchange={e => commit((e.currentTarget as HTMLInputElement).value)} />
  {/if}
{/snippet}

<Section id="stage.narrative" label="vars and events" open={false} help="The narrative of the book's plugins on the stage: tap a target, set their variables by hand, read the stage's timeline.">
  <div class="row top" data-help="Taps a target's AR content without aiming at it, as a reader's tap would: the entity's onTap (a plugin component's, the animation's playOn: tap, a behaviour's tap rules) and the event targetTapped. Only a found target with AR content takes a tap.">
    <span class="label">tap</span>
    <span class="controls">
      {#each taps as t (t.id)}
        <button type="button" class="pill" disabled={!t.tappable} title={t.tappable ? `Tap ${t.label}` : `${t.label} is not found on the stage`} onclick={() => stage?.tap(t.id)}>{t.label}</button>
      {:else}
        <span class="small muted">none</span>
      {/each}
    </span></div>

  <div class="row" data-help="The plugins' api.vars, each with its scope and type. Reset starts a new game: every variable cleared, nothing unlocked, the timeline empty, the spread found anew.">
    <span class="label">vars</span>
    <span class="controls">
      {#if !vars.length}<span class="small muted">none</span>{/if}
      <button type="button" class="pill" onclick={() => stage?.resetNarrative()}>reset</button>
      {#if varError}<span class="small danger">{varError}</span>{/if}
    </span></div>
  {#each vars as v (v.scope + ":" + v.name)}
    <div class="row top" data-help-name="{v.scope} · {v.name}" data-help="A variable of the {v.scope} scope, a {v.type}. Change it to test a branch: it is written through the plugin API, so the plugins hear varChanged as from a plugin's set. The cross deletes it.">
      <span class="label var" title="{v.scope} · {v.name}">{v.name}</span>
      <span class="controls">
        <span class="small muted tag">{v.scope} · {v.type}</span>
        {@render valueControl(v.type, v.value, `${v.scope} ${v.name}`, value => write(v.name, value, v.scope))}
        <button type="button" class="icon-button" aria-label="Delete {v.name}" title="Delete {v.name}" onclick={() => write(v.name, null, v.scope)}><Icon name="close" /></button>
      </span></div>
  {/each}
  <div class="row top" data-help="Sets a variable by hand, as a plugin's api.vars.set(name, value, scope) would – a camelCase name, a scope and a value of a type. An existing variable of that name and scope takes the new value.">
    <span class="label">set</span>
    <span class="controls">
      <input class="field name" aria-label="Variable name" placeholder="name" bind:value={newName} />
      <select class="field" aria-label="Scope" bind:value={newScope}>
        {#each VAR_SCOPES as scope (scope)}<option value={scope}>{scope}</option>{/each}
      </select>
      <Segmented options={VAR_TYPES} value={newType} onchange={type => { newType = type; newValue = initialValue(type); }} />
      {@render valueControl(newType, newValue, "New value", value => (newValue = value))}
      <button type="button" class="pill" disabled={!newName.trim()} onclick={() => { if (write(newName.trim(), newValue, newScope)) newName = ""; }}>set</button>
    </span></div>

  <div class="row" data-help="The stage's events, newest first: the time since the spread opened, the event and its payload – found, lost, unlocked, tapped, spreadChanged, varChanged and the plugins' own; behaviour marks a rule of a behaviour component that ran (which target, the rule, its event and what it did) – the log's own line, not an event of the stage. Clear empties the list.">
    <span class="label">events</span>
    <span class="controls">
      <span class="small muted">{events.length || "none"}</span>
      <button type="button" class="text-link" disabled={!events.length} onclick={() => stage?.clearEvents()}>clear</button>
    </span></div>
  {#if events.length}
    <ol class="timeline" aria-label="Events">
      {#each events as e, i (i)}
        <li><span class="at muted">{formatElapsed(e.at)}</span><strong>{e.event}</strong>{#if e.detail}<span class="muted detail">{e.detail}</span>{/if}</li>
      {/each}
    </ol>
  {/if}
</Section>

<style>
  .w { width: 5rem; display: inline-flex; }
  .value { min-width: 0; overflow-wrap: anywhere; }
  .w :global(.scrub) { width: 100%; }
  .row.top { align-items: start; }
  .row.top > .label { line-height: var(--control-height); }
  .label.var { padding-left: 1rem; color: var(--text); }
  .tag { white-space: nowrap; }
  .name { width: 6rem; }
  .text { width: 8rem; }
  .timeline { flex-shrink: 0; list-style: none; margin: 0 0 .25rem; padding: 0; max-height: 12rem; overflow: auto; overflow-x: hidden; font-size: var(--text-small); }
  .timeline li { display: grid; grid-template-columns: 4.75rem auto minmax(0, 1fr); gap: .375rem; align-items: baseline; padding: .0625rem 0; }
  .at { font-variant-numeric: tabular-nums; text-align: right; }
  .detail { overflow-wrap: anywhere; }
</style>
