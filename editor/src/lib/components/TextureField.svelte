<script lang="ts">
  import { getAssets } from "@engine/content/game-config";
  import { textureTypes } from "@engine/types";
  import { library } from "#lib/library.svelte.js";
  import { fileNameOf } from "#lib/library-place.js";
  import { plugins } from "#lib/plugins.svelte.js";

  /**
   * A `texture` parameter's value (#188): none, a procedural texture of the book's plugins (registered or recorded – it
   * follows a Code tab Run), or a Library picture or video by its URL (the content's own pictures too). A value the lists
   * do not hold (a file since removed) stays selectable under its file name. Used by every spec row of that kind – a
   * component's, a material's, a node type's (the Inspector) and a plugin pass's (post-processing, #216).
   */
  let { value, label, onchange }: { value: string; label: string; onchange: (value: string) => void } = $props();

  const procedural = $derived.by(() => { void plugins.version; return textureTypes(); });
  const pictures = $derived.by(() => {
    const seen = new Map<string, string>();
    library.ofKinds(["image", "video"]).forEach(a => seen.set(a.url, a.name));
    getAssets().filter(a => a.assetType === "image" || a.assetType === "video").forEach(a => { if (!seen.has(a.src)) seen.set(a.src, fileNameOf(a.src)); });
    return [...seen.entries()].map(([src, name]) => ({ src, name }));
  });
</script>

<select class="field" aria-label={label} {value} onchange={e => onchange((e.currentTarget as HTMLSelectElement).value)}>
  <option value="">none</option>
  {#if procedural.length}
    <optgroup label="procedural">{#each procedural as type (type)}<option value={type}>{type}</option>{/each}</optgroup>
  {/if}
  {#if pictures.length}
    <optgroup label="files">{#each pictures as picture (picture.src)}<option value={picture.src}>{picture.name}</option>{/each}</optgroup>
  {/if}
  {#if value && !procedural.includes(value) && !pictures.some(p => p.src === value)}<option {value}>{fileNameOf(value)}</option>{/if}
</select>
