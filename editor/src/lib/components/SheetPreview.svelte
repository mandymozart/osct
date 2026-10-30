<script lang="ts">
  import type { PrintBox } from "#lib/sheet-preview.js";

  /**
   * A page or a double page as a picture (#153): the sheet's image when there is one, the targets' prints laid over it
   * (`printBoxes`), and the `fallback` (e.g. a typographic cover) when there is no image. `single`: a single page shown
   * from a double sheet (the image twice as wide, its right half in view).
   */
  let { image = null, ratio, prints = [], single = false, fallback }: {
    image?: string | null;
    ratio: number;
    prints?: PrintBox[];
    single?: boolean;
    fallback?: import("svelte").Snippet;
  } = $props();

  let failed = $state(false);
  $effect(() => {
    void image;
    failed = false;
  });
</script>

<span class="sheet" style:aspect-ratio={ratio}>
  {#if image && !failed}
    <img src={image} alt="" loading="lazy" decoding="async" class:single onerror={() => (failed = true)} />
  {:else if fallback}
    {@render fallback()}
  {/if}
  {#each prints as box (box.id)}
    <img class="print" src={box.src} alt="" loading="lazy" decoding="async"
      style:left="{box.left}%" style:top="{box.top}%" style:width="{box.width}%" />
  {/each}
</span>

<style>
  .sheet { position: relative; display: block; width: 100%; box-sizing: border-box; background: #fff; overflow: hidden; container-type: inline-size; }
  .sheet > img:not(.print) { display: block; width: 100%; height: 100%; object-fit: cover; }
  .sheet > img.single { width: 200%; max-width: none; margin-left: -100%; }
  .print { position: absolute; display: block; height: auto; }
</style>
