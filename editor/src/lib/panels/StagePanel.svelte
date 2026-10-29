<script lang="ts">
  import { onMount } from "svelte";
  import type { Stage } from "$lib/stage/stage.svelte";
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
   * new game (nothing unlocked, no variable).
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
