<script lang="ts">
  import type { Asset } from "#lib/api.js";
  import { library } from "#lib/library.svelte.js";

  /**
   * A file's picture credits (#277): one free text line, as the book prints its credits. The one field for it – the
   * Library (its *Credits…* action) and every file field of the Inspector (`FileField`: a target's image, a node's model,
   * video or sound, the environment's files) show it. The line belongs to the file in the Library (by its URL), so every
   * use of the file shows the same line. Saved on Enter or when the field is left; Esc keeps the saved line.
   */
  let { asset, autofocus = false, onclose }: {
    asset: Asset;
    /** Focus at once (the Library's action opens it) */
    autofocus?: boolean;
    /** The field was left (saved or not) */
    onclose?: () => void;
  } = $props();

  let input = $state<HTMLInputElement>();
  let error = $state<string | null>(null);

  $effect(() => {
    if (autofocus) input?.focus();
  });

  const save = async (text: string) => {
    error = null;
    if (text.trim() !== (asset.credits ?? "") && library.experienceId) {
      try {
        await library.setCredits(library.experienceId, asset.url, text);
      } catch (e) {
        error = library.error ?? String(e);
      }
    }
    onclose?.();
  };
</script>

<span class="credits-field">
  {#key asset.url + (asset.credits ?? "")}
    <input bind:this={input} class="field" value={asset.credits ?? ""} placeholder="credits – e.g. Book Golem by TER-JAN / DeviantArt"
      aria-label="Credits of {asset.name}" title="The picture credits – one line, as the book prints them; kept with the file in the Library"
      onclick={e => e.stopPropagation()}
      onkeydown={e => {
        const field = e.currentTarget as HTMLInputElement;
        if (e.key === "Enter") field.blur();
        else if (e.key === "Escape") { e.preventDefault(); field.value = asset.credits ?? ""; field.blur(); }
      }}
      onblur={e => void save((e.currentTarget as HTMLInputElement).value)} />
  {/key}
  {#if error}<span class="small danger">{error}</span>{/if}
</span>

<style>
  /* A line of its own in a row that wraps (the file field), and no taller than its input in a column (a Library card) */
  .credits-field { display: flex; flex-direction: column; gap: .125rem; flex: none; width: 100%; min-width: 0; }
  .credits-field .field { width: 100%; box-sizing: border-box; font-size: var(--text-small); }
</style>
