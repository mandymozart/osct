<script lang="ts">
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import { ApiError, listBooks, type BookSummary, type EnvironmentServing } from "#lib/api.js";
  import ImportForm from "#lib/ImportForm.svelte";
  import BookCover from "#lib/BookCover.svelte";
  import InfoView from "#lib/components/InfoView.svelte";
  import AiConnections from "#lib/AiConnections.svelte";

  /**
   * The editor's start (#153): the books of this instance as their covers on the left, the import of a new one on the
   * right. A book says only where it is live – each environment serves one book, the last one published there. Under
   * the books the AI connections with the MCP guide (#142) – connecting Claude is a first step of working here.
   */
  let books = $state<BookSummary[] | null>(null);
  let environments = $state<EnvironmentServing[]>([]);
  let error = $state<string | null>(null);

  const load = async () => {
    try {
      const data = await listBooks();
      books = data.books;
      environments = data.environments ?? [];
      error = null;
    } catch (e) {
      error = e instanceof ApiError ? e.message : String(e);
    }
  };
  onMount(() => void load());

  const strays = $derived(environments.filter(e => e.error || (e.book && !books?.some(b => b.id === e.book))));
</script>

<div class="split">
  <main class="shelf">
    <h1>Books</h1>
    {#if error}<p class="danger">{error}</p>{/if}
    {#if books === null && !error}
      <ul class="covers" aria-busy="true">
        {#each [0, 1] as i (i)}<li class="skeleton"><span class="cover-box"></span><span class="line"></span><span class="line short"></span></li>{/each}
      </ul>
    {:else if books?.length === 0}
      <p class="muted empty">No book yet. Import one with <b>Import a book</b>: the CDN, a URL or a file.
        <a class="text-link" href="/docs/tutorials/#bringing-in">How to bring a book in</a></p>
    {:else if books}
      <ul class="covers">
        {#each books as book (book.id)}
          <li>
            <a href={resolve(`${book.id}/`)} class="book">
              <span class="cover-box"><BookCover {book} /></span>
              <span class="title">{book.title}</span>
              <span class="author muted">{book.author}</span>
              <span class="live" data-help-name="Live" data-help="Where the book is live: each environment (local, staging, production) serves one book – the last one published there. Draft = no environment serves it.">
                {#each book.live ?? [] as l (l.env)}<span class="badge on" title={l.build ? `build ${l.build}` : undefined}>{l.env}</span>{:else}<span class="badge">draft</span>{/each}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
    {#each strays as e (e.env)}
      <p class="small muted" title="An environment whose book is not among the books here, or whose content store cannot be read">
        {e.env}: {e.error ? "the content store cannot be read" : `serves ${e.book}, a book not imported here`}
      </p>
    {/each}
    <AiConnections />
  </main>

  <aside class="side">
    <div class="import">
      <ImportForm ondone={async id => { await load(); await goto(resolve(`${id}/`)); }} />
    </div>
    <InfoView />
  </aside>
</div>

<style>
  /* Two halves under the top bar, each scrolling on its own; stacked on a narrow screen */
  .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(20rem, 1fr); height: calc(100dvh - var(--top-height)); }
  .shelf { overflow-y: auto; padding: 2rem clamp(1rem, 4vw, 3.5rem) 3rem; }
  .side { display: flex; flex-direction: column; min-height: 0; background: var(--surface-head); border-left: 1px solid var(--line); }
  .import { flex: 1; overflow-y: auto; display: grid; align-content: center; justify-items: center; padding: 2rem clamp(1rem, 4vw, 3.5rem); }
  .import > :global(*) { width: 100%; max-width: 26rem; }
  @media (max-width: 47.9rem) {
    .split { grid-template-columns: minmax(0, 1fr); height: auto; }
    .shelf { overflow: visible; }
    .side { border-left: none; border-top: 1px solid var(--line); }
    .side > :global(.info) { display: none; }
  }

  h1 { font-size: 1.125rem; font-weight: 600; margin: 0 0 1.5rem; }
  .empty { font-size: .875rem; max-width: 32rem; }
  .empty a { white-space: nowrap; }
  .covers { list-style: none; margin: 0 0 1.5rem; padding: 0; display: grid; gap: 2.25rem 1.75rem; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); }
  /* A phone shows two covers a row, not one cover as wide as the screen (#170) */
  @media (max-width: 47.9rem) { .covers { gap: 1.5rem 1rem; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); } }
  .book { display: grid; gap: .1875rem; text-decoration: none; }
  .cover-box { display: block; aspect-ratio: 230 / 320; margin-bottom: .5rem; border-radius: 2px; overflow: hidden; background: var(--surface-head);
    box-shadow: 0 0 0 1px var(--line), 0 1px 2px rgb(0 0 0 / .06), 0 8px 20px -8px rgb(0 0 0 / .18); transition: transform .2s, box-shadow .2s; }
  .book:focus-visible .cover-box { transform: translateY(-3px);
    box-shadow: 0 0 0 1px var(--text), 0 2px 4px rgb(0 0 0 / .08), 0 16px 28px -10px rgb(0 0 0 / .28); }
  @media (hover: hover) {
    .book:hover .cover-box { transform: translateY(-3px);
      box-shadow: 0 0 0 1px var(--text), 0 2px 4px rgb(0 0 0 / .08), 0 16px 28px -10px rgb(0 0 0 / .28); }
  }
  .book:focus-visible { outline: none; }
  .title { font-size: .875rem; font-weight: 600; line-height: 1.25; }
  .author { font-size: var(--text-size); }
  .live { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .25rem; }
  .badge { font-size: var(--text-small); line-height: 1; padding: .1875rem .375rem; border: 1px solid var(--line); color: var(--muted); }
  .badge.on { color: var(--text); border-color: var(--text); }
  .badge.on::before { content: "● "; font-size: .75em; vertical-align: .1em; }

  .skeleton .cover-box { animation: pulse 1.4s ease-in-out infinite; }
  .skeleton .line { display: block; height: .75rem; width: 70%; border-radius: 2px; background: var(--surface-head); }
  .skeleton .line.short { width: 40%; }
  @keyframes pulse { 50% { opacity: .5; } }
</style>
