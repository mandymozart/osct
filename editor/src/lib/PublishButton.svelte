<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    ApiError, errorText, getDraftManifest, listBooks, listEnvironments, publishBook,
    type BookSummary, type EnvironmentServing, type EnvironmentsInfo, type OtherBook, type PublishResult,
  } from "#lib/api.js";
  import { liveLabels, liveShort } from "#lib/live.js";
  import { publishStep, targetLabel, targetOf, type PublishStep } from "#lib/publish-target.js";

  /**
   * Publish: the draft becomes a content version of this instance's own environment (`POST /editor/books/{id}/publish`)
   * – an instance publishes there and nowhere else (#183). Next to the button: where the book is live, the target with
   * its backend (`staging · CDN`, `local · this server`) and, where this server is the target, that no CDN is
   * connected. The button opens a step in the page that names the book, the build, the target and what it replaces –
   * publishing over another book is said there and sends `replace`.
   */
  let { bookId }: { bookId: string } = $props();
  let info = $state<EnvironmentsInfo | null>(null);
  let books = $state<BookSummary[]>([]);
  let environments = $state<EnvironmentServing[]>([]);
  let step = $state<PublishStep | null>(null);
  let busy = $state(false);
  let result = $state<PublishResult | null>(null);
  let error = $state<string | null>(null);
  let stepElement = $state<HTMLElement | null>(null);

  const target = $derived(targetOf(info));
  const self = $derived(books.find(b => b.id === bookId));
  const titleOf = (id: string | null | undefined): string | null => (id ? (books.find(b => b.id === id)?.title ?? id) : null);

  const refresh = async () => {
    try {
      const [data, envs] = await Promise.all([listBooks(), listEnvironments()]);
      books = data.books;
      environments = data.environments;
      info = envs;
    } catch {
      // the publish itself still guards; the line next to the button stays empty
    }
  };
  onMount(() => void refresh());

  /** Opens the step: the book, its build now, the target and what it replaces there */
  const open = async (current?: OtherBook) => {
    if (!target) return;
    error = null;
    result = null;
    let build: string | null = null;
    try {
      build = (await getDraftManifest(bookId)).build;
    } catch {
      // the step still names the book and the target
    }
    const serving = current ? { env: current.env, book: current.book, build: current.build, since: current.since } : environments.find(e => e.env === target.env);
    step = publishStep(bookId, self?.title ?? bookId, build, target, serving, titleOf);
    await tick();
    stepElement?.querySelector<HTMLButtonElement>("button.primary")?.focus();
  };

  const publish = async () => {
    if (!target || !step) return;
    const replacing = step.replace;
    busy = true;
    error = null;
    try {
      result = await publishBook(bookId, target.env, replacing ? { replace: true } : {});
      step = null;
    } catch (e) {
      // The environment changed since the list was read: the step again, with what the API says it serves now
      if (e instanceof ApiError && e.code === "other-book" && !replacing) {
        await refresh();
        await open(e.details.current as OtherBook | undefined);
      } else {
        error = errorText(e, { code: true });
      }
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
  {#if target}
    <span class="small target" data-help-name="Publishes to" data-help={`This instance publishes to ${target.env} only – another environment is published from its own editor. ${target.store === "cdn" ? "The CDN is connected: readers load from its edges." : "No CDN is connected: this server stores and serves the published content."}`}>{targetLabel(target)}</span>
    {#if target.warning}<span class="small danger no-cdn" title={target.warning} data-help-name="No CDN" data-help={target.warning}>No CDN connected</span>{/if}
  {/if}
  <button type="button" class="pill primary" onclick={() => open()} disabled={busy || !target || !!step} title={target ? `Publish the draft to ${targetLabel(target)} – a step in the page names the book and the build first.` : "Publish the draft"}>{busy ? "Publishing…" : "Publish"}</button>
  {#if result}<span class="small muted done">published {result.build}{result.replaced ? ` – replaced ${titleOf(result.replaced.book) ?? "another book"}` : ""}</span>{/if}
  {#if error && !step}<span class="small danger">{error}</span>{/if}
  {#if step}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="step" role="dialog" aria-label="Publish" tabindex="-1" bind:this={stepElement} onkeydown={e => { if (e.key === "Escape") step = null; }}>
      <p class="head">{step.title}</p>
      <p>{step.build}</p>
      <p>{step.replaces}</p>
      {#if step.readers}<p class="strong">{step.readers}</p>{/if}
      {#if step.warning}<p class="danger" role="alert">{step.warning}</p>{/if}
      {#if error}<p class="danger">{error}</p>{/if}
      <p class="actions">
        <button type="button" class="pill primary" onclick={publish} disabled={busy}>{busy ? "Publishing…" : step.action}</button>
        <button type="button" class="text-link" onclick={() => (step = null)}>Cancel</button>
      </p>
    </div>
  {/if}
</span>

<style>
  .publish { position: relative; display: inline-flex; align-items: center; gap: .375rem; }
  .live, .target, .no-cdn, .done { white-space: nowrap; }
  .target { padding: 0 .375rem; line-height: 1.5; border: 1px solid var(--line); }
  .step { position: absolute; top: calc(100% + .5rem); right: 0; z-index: 30; width: min(24rem, calc(100vw - 1rem)); display: grid; gap: .375rem;
    padding: .75rem; border: 1px solid var(--line); background: var(--surface); color: var(--text); box-shadow: 0 8px 24px -8px rgb(0 0 0 / .25); }
  .step p { margin: 0; line-height: 1.45; white-space: normal; }
  .step .head { font-weight: 600; }
  .step .strong { font-weight: 600; }
  .step .actions { display: flex; align-items: center; gap: .75rem; margin-top: .25rem; }
  @media (max-width: 47.9rem) {
    .live, .done { display: none; }
    .no-cdn { display: none; }
    .step { position: fixed; top: calc(var(--top-height) + .25rem); right: .5rem; left: .5rem; width: auto; }
  }
</style>
