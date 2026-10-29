<script lang="ts">
  import { DEFAULT_ENVIRONMENT, ENVIRONMENT_WORLDS, environmentOf, type EnvironmentData } from "@shared/types/environment";
  import { putEnvironment } from "$lib/api";

  /**
   * The book's **environment** (content schema 2.8): the world around the reader while scanning and the onion sky –
   * book-level only. The reader's Graphics switches (Info → Settings) still apply on top. *Save* writes it to the book's
   * draft through the editor API; *Use the default* removes it, and the café with the onion sky applies again.
   */
  let { bookId, saved, onsaved }: { bookId: string; saved: EnvironmentData | undefined; onsaved: () => Promise<void> } = $props();

  const WORLD_LABELS: Record<string, string> = { cafe: "café" };
  const current = $derived(environmentOf({ environment: saved }));

  let world = $state<string>(DEFAULT_ENVIRONMENT.world);
  let onionSky = $state(DEFAULT_ENVIRONMENT.onionSky);
  let busy = $state(false);
  let error = $state<string | null>(null);

  // The saved values, also after a reload from the server (the draft's book, not the edits in progress)
  $effect(() => {
    world = current.world;
    onionSky = current.onionSky;
  });

  const dirty = $derived(world !== current.world || onionSky !== current.onionSky);

  const save = async (environment: EnvironmentData | null) => {
    busy = true;
    error = null;
    try {
      await putEnvironment(bookId, environment);
      await onsaved();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  };
</script>

<section class="environment">
  <div class="head">
    <span class="section-label">environment</span>
    <span class="small muted" data-help-name="Environment" data-help="The book's world around the reader while scanning, and the onion sky. The reader's Graphics switches (Info → Settings) still apply on top.">{saved ? "this book's" : "the default"}</span>
  </div>
  <div class="row" data-help="The world around the reader while scanning.">
    <span class="label">world</span>
    <select bind:value={world} aria-label="world">
      {#each ENVIRONMENT_WORLDS as name (name)}<option value={name}>{WORLD_LABELS[name] ?? name}</option>{/each}
    </select>
  </div>
  <div class="row" data-help="Looking up, the reader sees the world's onion sky.">
    <span class="label">onion sky</span>
    <label class="check"><input type="checkbox" bind:checked={onionSky} /> on</label>
  </div>
  <div class="actions">
    {#if saved}<button type="button" class="text-link" disabled={busy} onclick={() => save(null)}>Use the default</button>{/if}
    <span class="grow"></span>
    {#if error}<span class="small danger">{error}</span>{/if}
    <button type="button" class="pill primary" disabled={!dirty || busy} onclick={() => save({ world: world as EnvironmentData["world"], onionSky })}>
      {busy ? "Saving…" : "Save"}
    </button>
  </div>
</section>

<style>
  .environment { margin: .5rem 0 1rem; padding: .5rem .625rem; border: 1px solid var(--line); border-radius: var(--control-radius); }
  .head { display: flex; align-items: baseline; gap: .5rem; margin-bottom: .375rem; }
  .row { display: flex; align-items: center; gap: .75rem; padding: .25rem 0; }
  .label { width: 6rem; color: var(--muted); }
  .check { display: inline-flex; align-items: center; gap: .375rem; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
