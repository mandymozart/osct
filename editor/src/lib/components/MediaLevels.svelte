<script lang="ts">
  import { MEDIA_LEVELS, type LevelledKind, type MediaLevelData } from "@shared/types/media-levels";
  import { library } from "#lib/library.svelte.js";
  import { fileNameOf, formatSize } from "#lib/library-place.js";
  import { levelLabel } from "#lib/media-levels.js";

  /**
   * A node's picture, video or sound in quality levels (#331 step 3, content schema 4.3): one chip per level of its kind –
   * a level there shows its file and weight (× removes it), a missing one is a slot with **Upload…** and **Library…** for
   * that level. Pictures also get **Compute …** – the smaller levels made here in the browser from the largest one (or the
   * node's own file), WebP as the image rule. Videos and sounds are uploaded per level – a video is never encoded in the
   * browser. The panel owns the node: this only shows and asks.
   */
  let { kind, levels, accept, error = null, busy = null, onupload, onlibrary, onremove, oncompute }: {
    kind: LevelledKind;
    levels: readonly MediaLevelData[] | undefined;
    /** The upload's file types */
    accept: string;
    /** Why the last file was not taken */
    error?: string | null;
    /** What is being computed or uploaded */
    busy?: string | null;
    onupload: (level: number, file: File) => void;
    onlibrary: (level: number) => void;
    onremove: (level: number) => void;
    /** Pictures: make the levels below the largest one; `missing` = the levels it would make */
    oncompute?: () => void;
  } = $props();

  const all = $derived<readonly number[]>(MEDIA_LEVELS[kind]);
  const byLevel = $derived(new Map((levels ?? []).map(entry => [entry.level, entry.src])));
  const weight = (src: string) => {
    const asset = library.byUrl(src);
    return asset ? formatSize(asset.size) : "";
  };
  const nameOf = (src: string) => library.byUrl(src)?.name ?? fileNameOf(src);
  let inputs = $state<Record<number, HTMLInputElement>>({});
  const what = $derived(kind === "image" ? "picture" : kind === "video" ? "film" : "sound");
</script>

<div class="row levels" data-help-name="Levels"
  data-help="The {what} in several qualities: the reader's media quality (Info → Settings) chooses which level is loaded, the node's own file stays what an older app shows. {kind === 'video' ? 'Make the video levels before uploading – the editor does not encode video.' : kind === 'image' ? 'Compute makes the smaller levels from the largest here in the browser.' : 'Upload each bitrate into its slot.'}">
  <span class="label">levels</span>
  <span class="controls chips">
    {#each all as level (level)}
      {@const src = byLevel.get(level)}
      {#if src}
        <span class="chip" title="{nameOf(src)}{weight(src) ? ` · ${weight(src)}` : ""}">
          <span class="size">{levelLabel(kind, level)}</span>{#if weight(src)}<span class="muted">{weight(src)}</span>{/if}
          <button type="button" class="remove" aria-label="Remove the {levelLabel(kind, level)} level" title="Remove the {levelLabel(kind, level)} level" onclick={() => onremove(level)}>×</button>
        </span>
      {:else}
        <span class="chip slot" title="No {levelLabel(kind, level)} level yet">
          <span class="size muted">{levelLabel(kind, level)}</span>
          <button type="button" class="slot-action" disabled={!!busy} title="Upload the {levelLabel(kind, level)} {what}" onclick={() => inputs[level]?.click()}>Upload…</button>
          <button type="button" class="slot-action" disabled={!!busy} title="Choose the {levelLabel(kind, level)} {what} in the Library" onclick={() => onlibrary(level)}>Library…</button>
          <input bind:this={inputs[level]} type="file" {accept} hidden
            onchange={e => { const file = (e.currentTarget as HTMLInputElement).files?.[0]; if (file) onupload(level, file); (e.currentTarget as HTMLInputElement).value = ""; }} />
        </span>
      {/if}
    {/each}
  </span>
</div>
{#if busy || oncompute}
  <div class="row"><span class="label"></span>
    <span class="controls">
      {#if busy}<span class="muted small" aria-live="polite">{busy}</span>
      {:else if oncompute}
        <button type="button" class="pill framed" title="Computes the smaller levels here in the browser from the largest picture – WebP, uploaded and put in the levels"
          onclick={() => oncompute()}>Compute smaller levels</button>
      {/if}
    </span>
  </div>
{/if}
{#if error}<p class="problem danger" role="alert">{error}</p>{/if}

<style>
  .chips { flex: 1; flex-wrap: wrap; gap: 0.25rem; }
  .chip { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0 0.375rem; border: 1px solid var(--line); border-radius: var(--control-radius); white-space: nowrap; }
  .chip.slot { border-style: dashed; }
  .size { font-variant-numeric: tabular-nums; }
  .remove, .slot-action { border: 0; padding: 0 0.125rem; background: none; color: inherit; cursor: pointer; }
  .slot-action { text-decoration: underline; font-size: 0.85em; }
  .slot-action:disabled { cursor: default; opacity: 0.5; }
  .problem { margin: 0.25rem 0 0; }
</style>
