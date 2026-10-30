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
    DESKS, getPreview, HDRIS, isDeskId, isHdriId, subscribePreview, updatePreview, type PreviewState,
  } from "#lib/stage/preview.js";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import PassesPanel from "./PassesPanel.svelte";

  /**
   * The stage's settings in collapsible sections (open state kept per section): the **spread** (its format), the
   * **stage** (hand shake, the grid over the page, the origin every position is counted from, the desk and the sky),
   * the **post-processing** (the book's passes, a spread's own as an override), and the **narrative** of the book's plugins (their variables with scopes, the
   * last events of the stage, *reset* for a new game) – closed by default. The camera is moved on the stage itself;
   * found / lost per target is the tree's eye, the first find is replayed from the stage's menu. Explanations are the
   * controls' help in the Info view.
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
</script>

<Section id="stage.spread" label="spread" help="The spread's own settings, saved to the draft.">
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

<Section id="stage.stage" label="stage" help="How the editor shows the spread – stored in this browser, not in the content.">
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

  <div class="row" data-help="The desk the book lies on: Eiermann's steel frame with a plywood top, or Schöpfer's white desk.">
    <span class="label">desk</span>
    <span class="controls">
      <select class="field wide" aria-label="Desk" value={preview.desk} onchange={e => { const id = (e.currentTarget as HTMLSelectElement).value; if (isDeskId(id)) updatePreview({ desk: id }); }}>
        {#each DESKS as desk (desk.id)}<option value={desk.id}>{desk.name}</option>{/each}
      </select>
    </span></div>

  <div class="row" data-help="The sky and its light: a studio HDRI, shown while the shading is rendered.">
    <span class="label">sky</span>
    <span class="controls">
      <select class="field wide" aria-label="HDRI" value={preview.hdri} onchange={e => { const id = (e.currentTarget as HTMLSelectElement).value; if (isHdriId(id)) updatePreview({ hdri: id }); }}>
        {#each HDRIS as hdri (hdri.id)}<option value={hdri.id}>{hdri.name}</option>{/each}
      </select>
    </span></div>
</Section>

<PassesPanel {stage} {bookId} {spreadId} />

<Section id="stage.narrative" label="vars and events" open={false} help="The narrative of the book's plugins on the stage: their variables and the stage's latest events.">
  <div class="row" data-help="The plugins' api.vars with their scope (book, stage, …). Reset starts a new game: every variable cleared, nothing unlocked, the spread found anew.">
    <span class="label">vars</span>
    <span class="controls">
      {#each stage?.vars ?? [] as v (v.scope + ":" + v.name)}
        <span class="pill framed var" title="{v.scope} scope"><span class="muted">{v.scope} ·</span> {v.name} = {JSON.stringify(v.value)}</span>
      {:else}
        <span class="small muted">none</span>
      {/each}
      <button type="button" class="pill" onclick={() => stage?.resetNarrative()}>reset</button>
    </span></div>

  <div class="row" data-help="The stage's events, newest first: found, lost, unlocked, spreadChanged and the plugins' own.">
    <span class="label">events</span>
    <span class="controls events">
      {#each stage?.events ?? [] as e, i (i)}
        <span class="small"><strong>{e.event}</strong>{#if e.detail} <span class="muted">{e.detail}</span>{/if}</span>
      {:else}
        <span class="small muted">none</span>
      {/each}
    </span></div>
</Section>

<style>
  .w { width: 5rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .wide { width: 100%; }
  .var { font-variant-numeric: tabular-nums; }
  .events { flex-direction: column; align-items: flex-start; gap: .125rem; max-height: 9rem; overflow: auto; }
  .events strong { margin-right: .25rem; }
  .events { overflow-x: hidden; }
  .events > span { max-width: 100%; overflow-wrap: anywhere; }
  .origin { display: inline-grid; grid-template-columns: repeat(3, .75rem); grid-template-rows: repeat(3, .75rem); gap: .125rem; padding: .125rem;
    border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--control-background); }
  .spot { width: .75rem; height: .75rem; padding: 0; border: 1px solid var(--muted); border-radius: 50%; background: none; cursor: pointer; }
  .spot:hover { border-color: var(--text); }
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
