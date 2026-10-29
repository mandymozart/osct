<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { goto } from "$app/navigation";
  import { ApiError, listBooks, type BookSummary } from "$lib/api";
  import { session } from "$lib/session.svelte";
  import ImportForm from "$lib/ImportForm.svelte";

  /** The books of this instance; a new one is made by importing a game configuration */
  let books = $state<BookSummary[] | null>(null);
  let error = $state<string | null>(null);
  let importing = $state(false);

  const load = async () => {
    try {
      books = (await listBooks()).books;
      error = null;
    } catch (e) {
      error = e instanceof ApiError ? e.message : String(e);
    }
  };
  onMount(() => void load());
</script>

<header class="top">
  <strong>OSCT Editor</strong>
  <span class="muted">{session.user?.email}</span>
  <span class="grow"></span>
  <button type="button" class="pill" onclick={() => session.signOut()}>Sign out</button>
</header>

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
            <span class="small muted">
              {#if book.lastPublish}published {book.lastPublish.env} {book.lastPublish.build} · {new Date(book.lastPublish.at).toLocaleString()}{:else}not published yet{/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
  {#if importing}
    <ImportForm oncancel={() => (importing = false)} ondone={async id => { importing = false; await load(); await goto(`${base}/${id}/`); }} />
  {:else}
    <p><button type="button" class="pill framed" onclick={() => (importing = true)}>Import a book…</button></p>
  {/if}
</main>

<style>
  .top { display: flex; align-items: center; gap: .75rem; height: 2.5rem; padding: 0 .75rem; background: var(--surface-head); border-bottom: 1px solid var(--line); }
  .grow { flex: 1; }
  main { max-width: 40rem; margin: 0 auto; padding: 1rem; }
  h1 { font-size: 1rem; font-weight: 600; margin: 0 0 .5rem; }
  .books { list-style: none; margin: 0 0 1rem; padding: 0; display: grid; gap: .375rem; }
  .book { display: grid; gap: .125rem; padding: .625rem .75rem; border: 1px solid var(--line); border-radius: var(--control-radius); text-decoration: none; }
  .book:hover { background: var(--hover-background); }
</style>
