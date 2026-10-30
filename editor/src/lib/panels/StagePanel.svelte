<script lang="ts">
  import { onMount } from "svelte";
  import { putSpread } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import { clampGrid } from "#lib/stage/preview.js";
  import { isOriginId, ORIGIN_SPOTS, ORIGINS, originHelp, originLabel } from "#lib/stage/origin.js";
  import Segmented from "#lib/components/Segmented.svelte";
  import Section from "#lib/components/Section.svelte";
  import {
    DESKS, getPreview, HDRIS, isDeskId, isHdriId, stageSummary, subscribePreview, updatePreview, type PreviewState,
  } from "#lib/stage/preview.js";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import { formatElapsed } from "#lib/stage/event-log.js";
  import { formatVar, initialValue, numberStep, tapTargets, VAR_TYPES, withTypes, type VarType } from "#lib/stage/narrative.js";
  import { VAR_SCOPES, type VarScope, type VarValue } from "@engine/scene/plugin-runtime";
  import PassesPanel from "./PassesPanel.svelte";
  import { stageEnvironment } from "#lib/environment.svelte.js";
  import { library } from "#lib/library.svelte.js";
  import { environmentSkyLabel } from "#lib/stage/sky.js";

  /**
   * The stage's settings in collapsible sections (open state kept per section, all closed on the first visit): the
   * **spread** (its format), the **stage** (hand shake, the grid over the page, the origin every position is counted
   * from, the desk and the sky – closed, its head names the desk and the grid; with the book's environment the sky is its
   * world, the HDRI waits for a book without one, #185), the **post-processing** (the book's
   * passes, a spread's own as an override – its head names the level), and the **narrative** of the book's plugins:
   * a tap button per target (the reader's tap without aiming), the variables with scope
   * and type, editable and deletable, a form to set one by hand (both written through the plugin API), *reset* for a
   * new game, and the stage's event timeline (time since the spread opened, event, payload) with *clear*. The camera
   * is moved on the stage itself; found / lost per target is the tree's eye, the first find is replayed from the
   * stage's menu. Explanations are the controls' help in the Info view.
   */
  let { stage, bookId, spreadId }: { stage: Stage | null; bookId: string; spreadId: string } = $props();

  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

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
      formatError = e instanceof Error ? e.message : String(e);
    }
  };
  const format = $derived(spread?.format ?? "spread");

  /** The book's environment replaces the HDRI as the sky (#185): the picker says so and stays for books without one */
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

<Section id="stage.spread" label="spread" open={false} help="The spread's own settings, saved to the draft.">
  <div class="row" data-help="What this spread is: a double page, the front cover or the back cover. Only a one-page spread can be a cover; the stage shows the closed book for one.">
    <span class="label">format</span>
    <span class="controls">
      <select class="field" aria-label="Spread format" value={spread?.format ?? "spread"} disabled={!singlePage}
        onchange={e => void setFormat((e.currentTarget as HTMLSelectElement).value as (typeof FORMATS)[number])}>
        {#each FORMATS as f (f)}<option value={f}>{f}</option>{/each}
      </select>
      {#if formatError}<span class="small danger">{formatError}</span>{/if}
    </span></div>
</Section>

<Section id="stage.stage" label="stage" open={false} summary={`${stageSummary(preview)}${environment ? " · the environment's sky" : ""}`} help="How the editor shows the spread – stored in this browser, not in the content.">
  <div class="row" data-help="Hand shake: 0 = still, 1 = a hand holding the phone. The stage wobbles like a reader's camera.">
    <span class="label">shake</span>
    <span class="controls"><span class="w"><ScrubNumber value={preview.wobble} min={0} max={1} step={0.05} fallback={0} strict label="Hand shake" oninput={wobble => updatePreview({ wobble })} /></span></span></div>

  <div class="row" data-help="A grid over the page: on / off and its spacing in mm. Its lines run through the origin, which is drawn red.">
    <span class="label">grid</span>
    <span class="controls">
      <Segmented options={["off", "on"] as const} value={preview.grid ? "on" : "off"} onchange={v => updatePreview({ grid: v === "on" })} />
      <span class="w"><ScrubNumber value={preview.gridMm} min={1} max={500} step={1} fallback={10} strict unit="mm" label="Grid spacing" oninput={gridMm => updatePreview({ gridMm: clampGrid(gridMm) })} /></span>
    </span></div>

  <div class="row" data-help="Where the grid and every x / y in the editor count from – a point of the alignment square: a corner or an edge's centre of the page a position lies on, or the centre (the book's centre, the spine's middle, on the open book; the page's centre on a cover). x runs to the right, y downwards; left of or above the origin is negative. Saved positions stay mm from the page's top left. Now: {originHelp(preview.origin, format)}">
    <span class="label">origin</span>
    <span class="controls">
      <span class="origin" role="radiogroup" aria-label="Origin">
        {#each ORIGINS as origin (origin)}
          <button type="button" role="radio" class="spot" class:on={preview.origin === origin} aria-checked={preview.origin === origin} aria-label={originLabel(origin, format)}
            data-help={originHelp(origin, format)} style:grid-column={ORIGIN_SPOTS[origin].col + 1} style:grid-row={ORIGIN_SPOTS[origin].row + 1}
            onclick={() => { if (isOriginId(origin)) updatePreview({ origin }); }}></button>
        {/each}
      </span>
      <span class="small">{originLabel(preview.origin, format)}</span>
    </span></div>

  <div class="row" data-help="The desk the book lies on: Eiermann's steel frame with a plywood top, or Schöpfer's desk – linoleum and oak, open drawers, a black steel frame.">
    <span class="label">desk</span>
    <span class="controls">
      <select class="field wide" aria-label="Desk" value={preview.desk} onchange={e => { const id = (e.currentTarget as HTMLSelectElement).value; if (isDeskId(id)) updatePreview({ desk: id }); }}>
        {#each DESKS as desk (desk.id)}<option value={desk.id}>{desk.name}</option>{/each}
      </select>
    </span></div>

  {#if environment}
  <div class="row" data-help="The sky: the book's environment (the Environment tab) – while rendered its world replaces the HDRI, and the scene's own lights light the stage, as in the reader.">
    <span class="label">sky</span>
    <span class="controls"><span class="small">{environmentSkyLabel(environment, url => library.byUrl(url)?.name)}</span></span></div>
  {/if}
  <div class="row" data-help={environment
    ? "The studio HDRI – overridden by the book's environment, used again for a book without one (Environment tab → Use the default)."
    : "The sky and its light: a studio HDRI, shown while the shading is rendered. A book's environment replaces it (the Environment tab)."}>
    <span class="label">{environment ? "HDRI" : "sky"}</span>
    <span class="controls">
      <select class="field wide" class:overridden={!!environment} aria-label="HDRI" value={preview.hdri} onchange={e => { const id = (e.currentTarget as HTMLSelectElement).value; if (isHdriId(id)) updatePreview({ hdri: id }); }}>
        {#each HDRIS as hdri (hdri.id)}<option value={hdri.id}>{hdri.name}</option>{/each}
      </select>
      {#if environment}<span class="small muted">without an environment</span>{/if}
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
  <div class="row top" data-help="Taps a target's AR content without aiming at it, as a reader's tap would: the entity's onTap (a plugin component's, the animation's playOn: tap) and the event targetTapped. Only a found target with AR content takes a tap.">
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

  <div class="row" data-help="The stage's events, newest first: the time since the spread opened, the event and its payload – found, lost, unlocked, tapped, spreadChanged, varChanged and the plugins' own. Clear empties the list.">
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
  .w :global(.scrub) { width: 100%; }
  .wide { width: 100%; }
  .overridden { opacity: .6; }
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
  .origin { display: inline-grid; grid-template-columns: repeat(3, .75rem); grid-template-rows: repeat(3, .75rem); gap: .125rem; padding: .125rem;
    border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--control-background); }
  .spot { width: .75rem; height: .75rem; padding: 0; border: 1px solid var(--muted); border-radius: 50%; background: none; cursor: pointer; }
  @media (hover: hover) {
    .spot:hover { border-color: var(--text); }
  }
  .spot.on { border-color: var(--text); background: var(--text); }
  /* A finger (#171): each point a 1.75rem cell to hit, the drawn dot the same size as with a mouse */
  @media (pointer: coarse) {
    .origin { grid-template-columns: repeat(3, 1.75rem); grid-template-rows: repeat(3, 1.75rem); }
    .spot { position: relative; width: 1.75rem; height: 1.75rem; border: none; border-radius: 0; }
    .spot::before { content: ""; position: absolute; inset: calc(50% - .375rem); border: 1px solid var(--muted); border-radius: 50%; }
    .spot.on { background: none; }
    .spot.on::before { border-color: var(--text); background: var(--text); }
  }
</style>
