<script lang="ts">
  import { onMount } from "svelte";
  import { ApiError, listBooks, publishBook, type BookSummary, type EnvironmentServing, type OtherBook, type PublishResult } from "$lib/api";
  import { liveLabels, liveShort, replaceQuestion } from "$lib/live";

  /**
   * Publish: the draft becomes a content version in the content store (`POST /editor/books/{id}/publish`) – `local`
   * for the dev API's folder, `staging` / `production` for the CDN the server is configured with. The readers of that
   * environment see it on their next start. An environment serves one book: where the book is live shows next to the
   * button, and publishing over another book asks first, naming both, then sends `replace`.
   */
  let { bookId }: { bookId: string } = $props();
  const ENVS = ["local", "staging", "production"] as const;
  let env = $state<(typeof ENVS)[number]>("local");
  let busy = $state(false);
  let result = $state<PublishResult | null>(null);
  let error = $state<string | null>(null);
  let books = $state<BookSummary[]>([]);
  let environments = $state<EnvironmentServing[]>([]);

  const self = $derived(books.find(b => b.id === bookId));
  const titleOf = (id: string | null | undefined): string | null => (id ? (books.find(b => b.id === id)?.title ?? id) : null);

  const refresh = async () => {
    try {
      const data = await listBooks();
      books = data.books;
      environments = data.environments ?? [];
    } catch {
      // the publish itself still guards; the line next to the button stays empty
    }
  };
  onMount(() => void refresh());

  const send = async (replace: boolean) => {
    try {
      return await publishBook(bookId, env, replace ? { replace } : {});
    } catch (e) {
      if (replace || !(e instanceof ApiError) || e.code !== "other-book") throw e;
      // The environment changed since the list was read: ask with what the API says it serves now
      const current = e.details.current as OtherBook | undefined;
      if (!confirm(replaceQuestion(env, self?.title ?? bookId, current?.title ?? current?.book ?? null))) return null;
      return publishBook(bookId, env, { replace: true });
    }
  };

  const publish = async () => {
    const serving = environments.find(e => e.env === env);
    const other = serving && !serving.error && serving.book !== bookId;
    if (other) {
      if (!confirm(replaceQuestion(env, self?.title ?? bookId, titleOf(serving.book)))) return;
    } else if (env === "production" && !confirm("Publish to production – every reader gets this version. Continue?")) {
      return;
    }
    busy = true;
    error = null;
    result = null;
    try {
      result = await send(!!other);
    } catch (e) {
      error = e instanceof ApiError ? `${e.message} (${e.code})` : String(e);
    } finally {
      busy = false;
      void refresh();
    }
  };
</script>

<span class="publish">
  {#if self}
    <span class="small muted live" data-help-name="Live" data-help={`Where this book is live – each environment serves one book, the last one published there: ${liveLabels(self.live).join("; ")}.`}>{liveShort(self.live)}</span>
  {/if}
  <select class="field" bind:value={env} aria-label="Environment" title="The environment to publish to: local (this API's own store), staging (testers) or production (every reader). Each serves one book.">
    {#each ENVS as option}<option value={option}>{option}</option>{/each}
  </select>
  <button type="button" class="pill primary" onclick={publish} disabled={busy} title="Publish the draft to the chosen environment. When it serves another book, you are asked first.">{busy ? "Publishing…" : "Publish"}</button>
  {#if result}<span class="small muted">published {result.build}{result.replaced ? ` – replaced ${titleOf(result.replaced.book) ?? "another book"}` : ""}</span>{/if}
  {#if error}<span class="small danger">{error}</span>{/if}
</span>

<style>
  .publish { display: inline-flex; align-items: center; gap: .375rem; }
  .live { white-space: nowrap; }
  @media (max-width: 47.9rem) { .live { display: none; } }
</style>
