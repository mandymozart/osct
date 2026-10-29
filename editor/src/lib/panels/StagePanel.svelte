<script lang="ts">
  import { onMount } from "svelte";
  import { content } from "$lib/content.svelte";
  import type { Stage } from "$lib/stage/stage.svelte";
  import {
    DESKS, getPreview, HDRIS, isDeskId, isHdriId, PREVIEW_VIEWS, setTargetHidden, subscribePreview, updatePreview, type PreviewState,
  } from "$lib/stage/preview";
  import Icon from "$lib/components/Icon.svelte";
  import ScrubNumber from "$lib/components/ScrubNumber.svelte";
  import Segmented from "$lib/components/Segmented.svelte";

  /**
   * The simulated camera: view presets (drag on the stage orbits, wheel / pinch the distance, double tap = reader),
   * found per target (off = lost → outro, on = found → reveal), replay of the first find, hand shake, the desk and
   * the sky (an HDRI) – and the **narrative** of the book's plugins: their variables with scopes, the last events of
   * the stage, and *reset* for a new game (nothing unlocked, no variable).
   */
  let { stage, spreadId }: { stage: Stage | null; spreadId: string } = $props();

  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

  // From the reactive content (a reload after a save or a spread switch recomputes it)
  const targets = $derived((content.spread(spreadId)?.targets ?? []).filter(target => target.imageSrc));
</script>

<div class="row"><span class="label">view</span>
  <span class="controls">
    <Segmented options={PREVIEW_VIEWS} value={preview.orbit ? null : preview.view} onchange={view => updatePreview({ view, orbit: null })} />
    {#if preview.orbit}<span class="small muted">free · {Math.round(preview.orbit.distance)} mm · {Math.round(preview.orbit.tilt)}° · {Math.round(preview.orbit.yaw)}°{#if preview.orbit.pan} · pan {Math.round(preview.orbit.pan.x)} / {Math.round(preview.orbit.pan.y)} mm{/if}</span>{/if}
  </span></div>

<div class="row"><span class="label">found</span>
  <span class="controls">
    {#if targets.length}
      {#each targets as target (target.id)}
        {@const shown = !preview.hidden.includes(target.id)}
        <button type="button" class="pill" class:on={shown} aria-pressed={shown} title={shown ? "Found – tap to lose" : "Lost – tap to find"}
          onclick={() => setTargetHidden(target.id, shown)}>
          {stage?.found.includes(target.id) ? "◉" : "○"} {target.id}
        </button>
      {/each}
      <button type="button" class="icon-button" title="Replay the first find" aria-label="Replay the first find" onclick={() => stage?.replayUnlock()}><Icon name="replay" /></button>
    {:else}
      <span class="small muted">no targets with an image on this spread</span>
    {/if}
  </span></div>

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

<style>
  .w { width: 5rem; display: inline-flex; }
  .var { font-variant-numeric: tabular-nums; }
  .events { flex-direction: column; align-items: flex-start; gap: .125rem; max-height: 9rem; overflow: auto; }
  .w :global(.scrub) { width: 100%; }
  .hint { margin: .25rem 0 0; padding-left: 5.125rem; }
</style>
