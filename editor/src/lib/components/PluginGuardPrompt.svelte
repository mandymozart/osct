<script lang="ts">
  import { pluginGuard } from "#lib/plugin-guard.svelte.js";
  import { sourceOrigin, whoName } from "#lib/plugin-guard.js";

  /**
   * The prompt before others' plugin code runs on the stage (#340) – never a browser dialog: the plugins whose code the
   * signed-in editor did not save last, each with who did, and *Run* / *Don't run* for all of them. The stage runs in the
   * editor's page, so the code acts with this person's session. Esc is *Don't run*.
   */
  const asking = $derived(pluginGuard.asking);
  /** The title names the one who saved them, when it is one person */
  const title = $derived.by(() => {
    if (!asking) return "";
    const one = new Set(asking.sources.map(sourceOrigin)).size === 1 && asking.sources.every(s => s.kind === "saved");
    return one ? `Run plugin code by ${whoName(asking.sources[0].savedBy)}?` : "Run plugin code you did not save?";
  });
  let skip = $state<HTMLButtonElement>();
  $effect(() => {
    if (asking) skip?.focus();
  });
</script>

{#if asking}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="backdrop" data-app-ui role="presentation" onkeydown={e => { if (e.key === "Escape") pluginGuard.answer("skip"); }}>
    <div class="prompt" role="alertdialog" aria-modal="true" aria-labelledby="plugin-guard-title" aria-describedby="plugin-guard-why">
      <h2 id="plugin-guard-title">{title}</h2>
      <p id="plugin-guard-why">The stage runs the experience's code in this page, with your session: it can do what you may do here – change the draft,
        the data, the game state. Run it only if you trust who saved it.</p>
      <ul class="sources">
        {#each asking.sources as source (source.id)}
          <li><code>{source.id}</code> <span class="who">{source.kind === "declared" ? sourceOrigin(source) : `saved last by ${sourceOrigin(source)}`}</span></li>
        {/each}
      </ul>
      <p class="muted small">Asked once per version: a new save by someone else asks again. Don't run leaves them off the stage – the Code tab says so, and Run there runs one.</p>
      <p class="actions">
        <button type="button" class="pill primary" onclick={() => pluginGuard.answer("run")}>Run</button>
        <button type="button" class="text-link" bind:this={skip} onclick={() => pluginGuard.answer("skip")}>Don't run</button>
      </p>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgb(0 0 0 / .35); }
  .prompt { display: grid; gap: .375rem; width: min(30rem, calc(100vw - 2rem)); max-height: calc(100vh - 4rem); overflow-y: auto; padding: .75rem 1rem;
    border: 1px solid var(--line); background: var(--surface); color: var(--text); }
  h2 { margin: 0; font-size: 1rem; }
  p { margin: 0; line-height: 1.45; }
  .sources { list-style: none; margin: .25rem 0; padding: 0; max-height: 12rem; overflow-y: auto; border-top: 1px solid var(--line); }
  .sources li { display: flex; flex-wrap: wrap; gap: .5rem; padding: .125rem 0; border-bottom: 1px solid var(--line); font-size: var(--text-small); }
  .who { color: var(--muted); }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .75rem; margin-top: .25rem; }
</style>
