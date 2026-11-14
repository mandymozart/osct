<script lang="ts">
  import { getAssets } from "@engine/content/game-config";
  import { library } from "#lib/library.svelte.js";
  import { fileNameOf } from "#lib/library-place.js";

  /**
   * A `model` parameter's value (#263): none, or a model file by its URL – a Library model, or one of the content's own.
   * A value the list does not hold (a file since removed, a file a parameter alone names) stays selectable under its
   * file name. Used by every spec row of that kind – a component's, a material's, a node type's (the Inspector) and a
   * plugin pass's (post-processing).
   */
  let { value, label, onchange }: { value: string; label: string; onchange: (value: string) => void } = $props();

  const MODEL_KINDS = ["glb", "gltf"];

  const models = $derived.by(() => {
    const seen = new Map<string, string>();
    library.ofKinds(MODEL_KINDS).forEach(a => seen.set(a.url, a.name));
    getAssets().filter(a => MODEL_KINDS.includes(a.assetType)).forEach(a => { if (!seen.has(a.src)) seen.set(a.src, fileNameOf(a.src)); });
    return [...seen.entries()].map(([src, name]) => ({ src, name }));
  });
</script>

<select class="field" aria-label={label} {value} onchange={e => onchange((e.currentTarget as HTMLSelectElement).value)}>
  <option value="">none</option>
  {#each models as model (model.src)}<option value={model.src}>{model.name}</option>{/each}
  {#if value && !models.some(m => m.src === value)}<option {value}>{fileNameOf(value)}</option>{/if}
</select>
