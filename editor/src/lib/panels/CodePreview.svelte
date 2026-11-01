<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { CodePreview } from "#lib/plugins/monaco.js";
  import { errorText } from "#lib/api.js";

  /**
   * A code file's text in a read-only Monaco (the Library's code files – #186): loaded with the first preview (Monaco's
   * own chunk, as the Code tab's), the language from the file (`codeLanguage`), disposed with the component.
   */
  let { value, language }: { value: string; language: string } = $props();

  let host = $state<HTMLElement>();
  let preview = $state<CodePreview | null>(null);
  let failed = $state<string | null>(null);

  onMount(() => {
    let disposed = false;
    let made: CodePreview | null = null;
    import("#lib/plugins/monaco.js").then(({ createCodePreview }) => {
      if (disposed || !host) return;
      made = createCodePreview(host, untrack(() => value), untrack(() => language));
      preview = made;
    }).catch(e => { failed = `The preview could not be loaded: ${errorText(e)}`; });
    return () => {
      disposed = true;
      made?.dispose();
      preview = null;
    };
  });

  // A replace or another file: the new text in place
  let last = { value: untrack(() => value), language: untrack(() => language) };
  $effect(() => {
    if (!preview || (value === last.value && language === last.language)) return;
    last = { value, language };
    preview.show(value, language);
  });
</script>

<div class="preview" data-help-name="Preview" data-help="The file's text, read-only. A script is edited in the Code tab (Open in Code); a shader is changed by replacing the file.">
  <div class="monaco" bind:this={host}></div>
  {#if !preview}<p class="small muted loading">{failed ?? "loading the preview…"}</p>{/if}
</div>

<style>
  .preview { position: relative; height: 12rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--control-background); overflow: hidden; }
  .monaco { position: absolute; inset: 0; }
  .loading { position: absolute; inset: 0; margin: 0; padding: .375rem .5rem; }
</style>
