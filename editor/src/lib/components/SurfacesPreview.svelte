<script lang="ts">
  import type { PreviewPart } from "#lib/surface-preview.js";

  /**
   * A scene as a picture (#153, #319): its surfaces side by side (`previewParts`), each its reference image fitted as it
   * says – paper without one – with the targets' prints over it; the `fallback` (e.g. a typographic cover) when the
   * scene has no reference image at all. `labels`: a surface's label at its foot.
   */
  let { parts, ratio, labels = false, fallback }: {
    parts: PreviewPart[];
    ratio: number;
    labels?: boolean;
    fallback?: import("svelte").Snippet;
  } = $props();

  const pictured = $derived(parts.some(part => part.reference || part.prints.length));
</script>

<span class="scene" style:aspect-ratio={ratio}>
  {#if !pictured && fallback}
    {@render fallback()}
  {:else}
    {#each parts as part (part.id)}
      <span class="surface" style:flex-grow={part.share} style:height="{part.height * 100}%">
        {#if part.reference}
          <img class="reference {part.reference.fit}" src={part.reference.url} alt="" loading="lazy" decoding="async" />
        {/if}
        {#each part.prints as box (box.id)}
          <img class="print" src={box.src} alt="" loading="lazy" decoding="async"
            style:left="{box.left}%" style:top="{box.top}%" style:width="{box.width}%" />
        {/each}
        {#if labels && part.label}<span class="label">{part.label}</span>{/if}
      </span>
    {/each}
  {/if}
</span>

<style>
  .scene { position: relative; display: flex; align-items: flex-end; width: 100%; box-sizing: border-box; overflow: hidden; container-type: inline-size; }
  .surface { position: relative; flex-basis: 0; min-width: 0; background: #fff; overflow: hidden; }
  .surface + .surface { box-shadow: inset 1px 0 0 #ddd; }
  .reference { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .reference.cover { object-fit: cover; }
  .reference.contain { object-fit: contain; }
  .reference.stretch { object-fit: fill; }
  .print { position: absolute; display: block; height: auto; }
  .label { position: absolute; left: 0; right: 0; bottom: .1rem; text-align: center; font-size: .55rem; color: #777; }
</style>
