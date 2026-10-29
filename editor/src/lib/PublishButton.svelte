<script lang="ts">
  import { ApiError, publishBook, type PublishResult } from "$lib/api";

  /**
   * Publish: the draft becomes a content version in the content store (`POST /editor/books/{id}/publish`) – `local`
   * for the dev API's folder, `staging` / `production` for the CDN the server is configured with. The readers of that
   * environment see it on their next start.
   */
  let { bookId }: { bookId: string } = $props();
  const ENVS = ["local", "staging", "production"] as const;
  let env = $state<(typeof ENVS)[number]>("local");
  let busy = $state(false);
  let result = $state<PublishResult | null>(null);
  let error = $state<string | null>(null);

  const publish = async () => {
    if (env === "production" && !confirm("Publish to production – every reader gets this version. Continue?")) return;
    busy = true;
    error = null;
    result = null;
    try {
      result = await publishBook(bookId, env);
    } catch (e) {
      error = e instanceof ApiError ? `${e.message} (${e.code})` : String(e);
    } finally {
      busy = false;
    }
  };
</script>

<span class="publish">
  <select class="field" bind:value={env} aria-label="Environment">
    {#each ENVS as option}<option value={option}>{option}</option>{/each}
  </select>
  <button type="button" class="pill primary" onclick={publish} disabled={busy}>{busy ? "Publishing…" : "Publish"}</button>
  {#if result}<span class="small muted">published {result.build}</span>{/if}
  {#if error}<span class="small danger">{error}</span>{/if}
</span>

<style>
  .publish { display: inline-flex; align-items: center; gap: .375rem; }
</style>
