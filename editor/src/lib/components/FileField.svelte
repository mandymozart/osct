<script lang="ts">
  import { library } from "$lib/library.svelte";
  import { assetPlace } from "$lib/library-place";

  /**
   * A file field (#164): the chosen file – a picture as a small preview, every file by where it belongs
   * (`p015-1 · target`, the Library's label) –, **Library…** (the Library as a picker for this field) and **Upload…**
   * (a file of the accepted kinds). Used by every file a panel picks: a target's printed image, a node's file, the
   * environment's world and sky.
   */
  let { src, picture = false, empty = "no file", accept, label, onlibrary, onupload }: {
    /** The chosen file's URL ("" or undefined = none) */
    src: string | null | undefined;
    /** The file is a picture: show it */
    picture?: boolean;
    /** What the field says without a file */
    empty?: string;
    /** The upload's file types */
    accept: string;
    /** What the field is, for the buttons' tooltips ("the printed image") */
    label: string;
    onlibrary: () => void;
    onupload: (file: File) => void;
  } = $props();

  let input = $state<HTMLInputElement>();
  const name = $derived.by(() => {
    if (!src) return empty;
    const asset = library.byUrl(src);
    return asset ? assetPlace(asset).label : decodeURIComponent(src.split(/[?#]/)[0].split("/").pop() ?? src);
  });
</script>

<span class="controls file-field">
  {#if src && picture}<img class="thumb" src={src} alt="" />{/if}
  <span class="name" class:muted={!src} title={src ?? ""}>{name}</span>
  <button type="button" class="pill framed" title="Choose {label} in the Library" onclick={onlibrary}>Library…</button>
  <button type="button" class="pill framed" title="Upload {label}" onclick={() => input?.click()}>Upload…</button>
  <input bind:this={input} type="file" {accept} hidden
    onchange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) onupload(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
</span>

<style>
  .file-field { flex: 1; flex-wrap: wrap; }
  .thumb { flex: none; width: 2.5rem; height: 1.875rem; object-fit: contain; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface-head); }
  .name { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
