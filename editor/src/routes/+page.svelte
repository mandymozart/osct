<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { goto } from "$app/navigation";
  import { ApiError, listBooks, type BookSummary, type EnvironmentServing } from "$lib/api";
  import { liveLabels } from "$lib/live";
  import ImportForm from "$lib/ImportForm.svelte";

  /**
   * The books of this instance; a new one is made by importing a game configuration. Each environment serves one
   * book, the last one published there: a book shows where it is live, or *draft only*.
   */
  let books = $state<BookSummary[] | null>(null);
  let environments = $state<EnvironmentServing[]>([]);
  let error = $state<string | null>(null);
  let importing = $state(false);

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
</script>

<main>
  <h1>Books</h1>
  {#if error}<p class="danger">{error}</p>{/if}
  {#if books === null}
    <p class="muted">Loading…</p>
  {:else if books.length === 0 && !importing}
    <p class="muted">No book yet. Import the published content, or a game configuration file.</p>
  {/if}
  {#if books?.length}
    <ul class="books">
      {#each books as book (book.id)}
        <li>
          <a href="{base}/{book.id}/" class="book">
            <strong>{book.title}</strong>
            <span class="muted">{book.author} · {book.spreads} spreads · {book.id}</span>
            <span class="live" data-help-name="Live" data-help="Where the book is live: each environment (local, staging, production) serves one book – the last one published there. Draft only = no environment serves it.">
              {#each liveLabels(book.live) as label}<span class="small" class:muted={!book.live?.length}>{label}</span>{/each}
            </span>
            <span class="small muted">
              {#if book.lastPublish}last published {book.lastPublish.env} {book.lastPublish.build} · {new Date(book.lastPublish.at).toLocaleString()}{:else}not published yet{/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
  {#each environments.filter(e => e.error || (e.book && !books?.some(b => b.id === e.book))) as e (e.env)}
    <p class="small muted" title="An environment whose book is not among the books here, or whose content store cannot be read">
      {e.env}: {e.error ? "the content store cannot be read" : `serves ${e.book}, a book not imported here`}
    </p>
  {/each}
  {#if importing}
    <ImportForm oncancel={() => (importing = false)} ondone={async id => { importing = false; await load(); await goto(`${base}/${id}/`); }} />
  {:else}
    <p><button type="button" class="pill framed" onclick={() => (importing = true)}>Import a book…</button></p>
  {/if}
</main>

<style>
  main { max-width: 40rem; margin: 0 auto; padding: 1rem; }
  h1 { font-size: 1rem; font-weight: 600; margin: 0 0 .5rem; }
  .books { list-style: none; margin: 0 0 1rem; padding: 0; display: grid; gap: .375rem; }
  .book { display: grid; gap: .125rem; padding: .625rem .75rem; border: 1px solid var(--line); border-radius: var(--control-radius); text-decoration: none; }
  .book:hover { background: var(--hover-background); }
  .live { display: flex; flex-wrap: wrap; gap: 0 .75rem; }
</style>
