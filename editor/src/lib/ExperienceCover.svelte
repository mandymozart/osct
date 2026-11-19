<script lang="ts">
  import { onMount } from "svelte";
  import { getExperience, listScenes, type ExperienceSummary } from "#lib/api.js";
  import { previewParts, type PreviewPart } from "#lib/surface-preview.js";
  import SurfacesPreview from "#lib/components/SurfacesPreview.svelte";

  /**
   * A book's front cover as a picture (#153, #319): the first scene's first surface (a cover is a single scene first in
   * the order) with its reference image and the prints of its targets; a typographic cover (the title and the author on
   * the cover's halftone) while it has no picture. Loaded when the card is shown.
   */
  let { experience }: { experience: ExperienceSummary } = $props();

  let picture = $state<{ parts: PreviewPart[]; ratio: number } | null>(null);
  let loaded = $state(false);
  /** A page's ratio while nothing is loaded */
  const PAGE_RATIO = 230 / 320;

  onMount(() => {
    void Promise.all([getExperience(experience.id).catch(() => null), listScenes(experience.id).catch(() => null)]).then(([tree, list]) => {
      const scene = tree?.scenes[0];
      const surface = scene?.surfaces[0];
      const reference = list?.scenes.find(s => s.id === scene?.id)?.surfaces.find(s => s.id === surface?.id)?.reference;
      const targets = scene?.entries.flatMap(entry => (entry.target ? [entry.target] : [])) ?? [];
      picture = surface ? previewParts([surface], reference ? { [surface.id]: reference } : {}, targets, experience.assetsBase) : null;
      loaded = true;
    });
  });
</script>

<span class="cover" class:loaded>
  <SurfacesPreview parts={picture?.parts ?? []} ratio={picture?.ratio ?? PAGE_RATIO}>
    {#snippet fallback()}
      {#if loaded}
        <span class="type">
          <span class="gold title">{experience.title}</span>
          {#if experience.experience.book}<span class="gold author">{experience.experience.book.author}</span>{/if}
        </span>
      {/if}
    {/snippet}
  </SurfacesPreview>
</span>

<style>
  .cover { display: block; opacity: 0; transition: opacity .25s; }
  .cover.loaded { opacity: 1; }
  /* The printed cover's measured look (agents/DESIGN.md) */
  .type { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; align-items: center;
    padding: 9cqw 8cqw 10cqw; text-align: center;
    background: radial-gradient(circle, #ececec 0.5px, transparent 0.8px) 0 0 / 1cqw 1cqw, #fff; }
  /* Monochrome: the brand's gold is the reader's, not the editor's (Tilman, 2026-11-18) */
  .gold { color: #1e1e1e; line-height: 1.1; }
  .title { font-size: 9cqw; }
  .author { font-size: 6cqw; }
</style>
