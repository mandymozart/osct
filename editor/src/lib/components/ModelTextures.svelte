<script lang="ts">
  import type { TextureSetData, TextureSize } from "@shared/types/textures";
  import { library } from "#lib/library.svelte.js";
  import { fileNameOf, formatSize } from "#lib/library-place.js";
  import { missingBelow } from "#lib/texture-levels.js";

  /**
   * A model's texture sets (#260): per set the sizes it holds – each a chip with its size, the file and the file's
   * weight –, **Library…** and **Upload…** to add maps (several files at once; the size is read from each picture),
   * and the material the set is for (none = every material). The panel owns the node: this only shows and asks.
   *
   * **Levels computed in the browser** (#331 step 2): **Compute 1024 · 512** makes the sizes a set lacks below its
   * largest map; **One file → levels…** takes one picture (its size read from it), uploads it and makes every smaller
   * size from it – WebP, here in the browser (`texture-levels.ts`). `busy` says what is being made.
   */
  let { textures, accept, error = null, busy = null, onlibrary, onupload, onremove, onmaterial, oncompute, onfromone }: {
    textures: readonly TextureSetData[] | undefined;
    /** The upload's file types (pictures) */
    accept: string;
    /** Why the last map was not taken */
    error?: string | null;
    onlibrary: (set: number) => void;
    onupload: (set: number, files: File[]) => void;
    onremove: (set: number, size: TextureSize) => void;
    onmaterial: (set: number, material: string) => void;
    /** What is being computed or uploaded, for which set */
    busy?: { set: number; text: string } | null;
    /** Make the sizes the set lacks below its largest map */
    oncompute?: (set: number) => void;
    /** One picture: uploaded at its size, every smaller size made from it */
    onfromone?: (set: number, file: File) => void;
  } = $props();
  let oneInputs = $state<HTMLInputElement[]>([]);

  /** One row per set, and an empty one to start the first (or one for another material) */
  let extra = $state(false);
  const rows = $derived<readonly (TextureSetData | null)[]>(textures?.length ? [...textures, ...(extra ? [null] : [])] : [null]);
  const weight = (src: string) => {
    const asset = library.byUrl(src);
    return asset ? formatSize(asset.size) : "";
  };
  const nameOf = (src: string) => library.byUrl(src)?.name ?? fileNameOf(src);
  let inputs = $state<HTMLInputElement[]>([]);
</script>

{#each rows as set, i (i)}
  <div class="row textures" data-help-name="Textures" data-help="The model's colour map in several sizes: the model file carries the smallest one, the reader's texture quality (Info page) chooses which is loaded – the mesh loads once. Add the same map at 512, 1024, 2048 and 4096 px; the size is read from each picture.">
    <span class="label">{set?.material ?? (i === 0 ? "maps" : "")}</span>
    <span class="controls set">
      {#if set}
        <span class="sizes">
          {#each set.sizes as entry (entry.size)}
            <span class="chip" title="{nameOf(entry.src)}{weight(entry.src) ? ` · ${weight(entry.src)}` : ""}">
              <span class="size">{entry.size}</span>{#if weight(entry.src)}<span class="muted">{weight(entry.src)}</span>{/if}
              <button type="button" class="remove" aria-label="Remove the {entry.size} px map" title="Remove the {entry.size} px map" onclick={() => onremove(i, entry.size)}>×</button>
            </span>
          {/each}
        </span>
      {:else}
        <span class="muted grow">{i === 0 ? "the file's own map only" : "a set for another material"}</span>
      {/if}
      <button type="button" class="pill framed" title="Choose a map in the Library" onclick={() => onlibrary(i)}>Library…</button>
      <button type="button" class="pill framed" title="Upload maps – several at once" onclick={() => inputs[i]?.click()}>Upload…</button>
      <input bind:this={inputs[i]} type="file" {accept} multiple hidden
        onchange={e => { const files = [...((e.currentTarget as HTMLInputElement).files ?? [])]; if (files.length) { extra = false; onupload(i, files); } (e.currentTarget as HTMLInputElement).value = ""; }} />
    </span>
  </div>
  {#if oncompute || onfromone}
    {@const missing = missingBelow(set ?? undefined)}
    <div class="row"><span class="label"></span>
      <span class="controls levels">
        {#if busy?.set === i}<span class="muted small" aria-live="polite">{busy.text}</span>
        {:else}
          {#if oncompute && missing.length}
            <button type="button" class="pill framed" disabled={!!busy} title="Computes the smaller levels here in the browser from the {set?.sizes.at(-1)?.size} px map – WebP, uploaded and put in this set"
              onclick={() => oncompute(i)}>Compute {missing.join(" · ")}</button>
          {/if}
          {#if onfromone}
            <button type="button" class="pill framed" disabled={!!busy} title="One picture (512 … 4096 px, square): uploaded at its size, and every smaller level computed from it here in the browser"
              onclick={() => oneInputs[i]?.click()}>One file → levels…</button>
            <input bind:this={oneInputs[i]} type="file" {accept} hidden
              onchange={e => { const file = (e.currentTarget as HTMLInputElement).files?.[0]; if (file) { extra = false; onfromone(i, file); } (e.currentTarget as HTMLInputElement).value = ""; }} />
          {/if}
        {/if}
      </span>
    </div>
  {/if}
  {#if set && (textures?.length ?? 0) > 1 || set?.material}
    <div class="row"><span class="label">material</span>
      <input class="field" value={set?.material ?? ""} placeholder="every material" spellcheck="false" aria-label="The material this set is for"
        title="The glTF material whose map this set is – empty: every material of the model"
        onchange={e => onmaterial(i, (e.currentTarget as HTMLInputElement).value)} /></div>
  {/if}
{/each}
{#if textures?.length && !extra}
  <div class="row"><span class="label"></span>
    <button type="button" class="text-link" title="A model with a map per material has a set for each" onclick={() => (extra = true)}>+ a set for another material</button></div>
{/if}
{#if error}<p class="problem danger" role="alert">{error}</p>{/if}

<style>
  .set { flex: 1; flex-wrap: wrap; }
  .sizes { display: flex; flex: 1 1 0; flex-wrap: wrap; gap: 0.25rem; min-width: 0; }
  .chip { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0 0.375rem; border: 1px solid var(--line); border-radius: var(--control-radius); white-space: nowrap; }
  .size { font-variant-numeric: tabular-nums; }
  .remove { border: 0; padding: 0 0.125rem; background: none; color: inherit; cursor: pointer; }
  .grow { flex: 1 1 0; }
  .levels { flex: 1; flex-wrap: wrap; gap: 0.25rem; }
  .problem { margin: 0.25rem 0 0; }
</style>
