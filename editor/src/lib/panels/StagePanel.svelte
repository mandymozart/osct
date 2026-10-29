<script lang="ts">
  import { onMount } from "svelte";
  import type { Stage } from "$lib/stage/stage.svelte";
  import { clampGrid } from "$lib/stage/preview";
  import { isOriginId, ORIGIN_LABELS, ORIGINS } from "$lib/stage/origin";
  import Segmented from "$lib/components/Segmented.svelte";
  import {
    DESKS, getPreview, HDRIS, isDeskId, isHdriId, subscribePreview, updatePreview, type PreviewState,
  } from "$lib/stage/preview";
  import ScrubNumber from "$lib/components/ScrubNumber.svelte";
  import PassesPanel from "./PassesPanel.svelte";

  /**
   * The stage's settings: hand shake, the desk and the sky (an HDRI). The camera is moved on the stage itself (drag
   * orbits, wheel / pinch the distance, double tap = the reader's view), found / lost per target is the tree's eye,
   * the first find is replayed from the stage's menu – the panel no longer doubles them (Tilman, 2026-10-29). And the
   * **narrative** of the book's plugins: their variables with scopes, the last events of the stage, and *reset* for a
   * new game (nothing unlocked, no variable). The **grid** over the page (spacing in mm) and the **origin** the grid
   * and every position of the editor are counted from: a corner of the base format, or the book's centre.
   */
  let { stage, bookId, spreadId }: { stage: Stage | null; bookId: string; spreadId: string } = $props();

  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

</script>

<div class="row"><span class="label">vars</span>
  <span class="controls">
    {#if stage?.vars.length}
      {#each stage.vars as v (v.scope + ":" + v.name)}
        <span class="pill framed var" title="{v.scope} scope"><span class="muted">{v.scope} ·</span> {v.name} = {JSON.stringify(v.value)}</span>
      {/each}
    {:else}
      <span class="small muted">no variable set – the plugins' api.vars show here with their scope</span>
    {/if}
    <button type="button" class="pill" title="A new game: every variable cleared, nothing unlocked, the spread found anew" onclick={() => stage?.resetNarrative()}>reset</button>
  </span></div>

<div class="row"><span class="label">events</span>
  <span class="controls events">
    {#if stage?.events.length}
      {#each stage.events as e, i (i)}
        <span class="small"><strong>{e.event}</strong>{#if e.detail} <span class="muted">{e.detail}</span>{/if}</span>
      {/each}
    {:else}
      <span class="small muted">the stage's events – found, lost, unlocked, spreadChanged, the plugins' own – newest first</span>
    {/if}
  </span></div>

<div class="row"><span class="label">shake</span>
  <span class="controls">
    <span class="w"><ScrubNumber value={preview.wobble} min={0} max={1} step={0.05} fallback={0} strict label="Hand shake" oninput={wobble => updatePreview({ wobble })} /></span>
    <span class="small muted">0 = still, 1 = a hand holding the phone</span>
  </span></div>

<div class="row"><span class="label">grid</span>
  <span class="controls">
    <Segmented options={["off", "on"] as const} value={preview.grid ? "on" : "off"} onchange={v => updatePreview({ grid: v === "on" })} />
    <span class="w"><ScrubNumber value={preview.gridMm} min={1} max={500} step={1} fallback={10} strict unit="mm" label="Grid spacing" oninput={gridMm => updatePreview({ gridMm: clampGrid(gridMm) })} /></span>
  </span></div>

<div class="row"><span class="label">origin</span>
  <span class="controls">
    <Segmented options={ORIGINS} value={preview.origin} labels={ORIGIN_LABELS} titles={{ centre: "The spine's middle; x to the right, y downwards" }}
      onchange={origin => { if (isOriginId(origin)) updatePreview({ origin }); }} />
  </span></div>

<div class="row"><span class="label">desk</span>
  <span class="controls">
    <select class="field" aria-label="Desk" value={preview.desk} onchange={e => { const id = (e.currentTarget as HTMLSelectElement).value; if (isDeskId(id)) updatePreview({ desk: id }); }}>
      {#each DESKS as desk (desk.id)}<option value={desk.id}>{desk.name}</option>{/each}
    </select>
  </span></div>

<div class="row"><span class="label">sky</span>
  <span class="controls">
    <select class="field" aria-label="HDRI" value={preview.hdri} onchange={e => { const id = (e.currentTarget as HTMLSelectElement).value; if (isHdriId(id)) updatePreview({ hdri: id }); }}>
      {#each HDRIS as hdri (hdri.id)}<option value={hdri.id}>{hdri.name}</option>{/each}
    </select>
  </span></div>

<p class="hint small muted">drag = orbit · shift-drag / middle button / two fingers = pan · wheel / pinch = distance · double tap = reader · ← → spreads</p>

<PassesPanel {stage} {bookId} {spreadId} />

<style>
  .w { width: 5rem; display: inline-flex; }
  .var { font-variant-numeric: tabular-nums; }
  .events { flex-direction: column; align-items: flex-start; gap: .125rem; max-height: 9rem; overflow: auto; }
  .w :global(.scrub) { width: 100%; }
  .hint { margin: .25rem 0 0; padding-left: 5.125rem; }
</style>
