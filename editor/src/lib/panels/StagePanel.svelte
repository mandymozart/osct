<script lang="ts">
  import { onMount } from "svelte";
  import { content } from "$lib/content.svelte";
  import type { Stage } from "$lib/stage/stage.svelte";
  import {
    getPreview, PREVIEW_BACKDROPS, PREVIEW_VIEWS, setTargetHidden, subscribePreview, updatePreview, type PreviewState,
  } from "$lib/stage/preview";
  import Icon from "$lib/components/Icon.svelte";
  import ScrubNumber from "$lib/components/ScrubNumber.svelte";
  import Segmented from "$lib/components/Segmented.svelte";

  /**
   * The simulated camera: view presets (drag on the stage orbits, wheel / pinch the distance, double tap = reader),
   * found per target (off = lost → outro, on = found → reveal), replay of the first find, hand shake, backdrop
   * table / paper / a photo of the desk.
   */
  let { stage, spreadId }: { stage: Stage | null; spreadId: string } = $props();

  /** The photo behind the stage is stored on the device: long side at most this many pixels */
  const PHOTO_MAX_PX = 1600;

  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

  // From the reactive content (a reload after a save or a spread switch recomputes it)
  const targets = $derived((content.spread(spreadId)?.targets ?? []).filter(target => target.imageSrc));
  let fileInput = $state<HTMLInputElement>();

  const choosePhoto = async (file: File) => {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      updatePreview({ photo: canvas.toDataURL("image/jpeg", 0.85), backdrop: "photo" });
    } catch (error) {
      console.warn("[editor] The photo could not be read:", error);
    }
  };
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

<div class="row"><span class="label">shake</span>
  <span class="controls">
    <span class="w"><ScrubNumber value={preview.wobble} min={0} max={1} step={0.05} fallback={0} strict label="Hand shake" oninput={wobble => updatePreview({ wobble })} /></span>
    <span class="small muted">0 = still, 1 = a hand holding the phone</span>
  </span></div>

<div class="row"><span class="label">backdrop</span>
  <span class="controls">
    <Segmented options={PREVIEW_BACKDROPS} value={preview.backdrop} onchange={backdrop => updatePreview({ backdrop })} />
    <button type="button" class="icon-button" title="Choose a photo of your desk" aria-label="Choose a photo of your desk" onclick={() => fileInput?.click()}><Icon name="camera" /></button>
    <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void choosePhoto(f); }} />
    {#if preview.backdrop === "photo" && !preview.photo}<span class="small muted">choose a photo first</span>{/if}
  </span></div>

<p class="hint small muted">drag = orbit · shift-drag / middle button / two fingers = pan · wheel / pinch = distance · double tap = reader · ← → spreads</p>

<style>
  .w { width: 5rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .hint { margin: .25rem 0 0; padding-left: 5.125rem; }
</style>
