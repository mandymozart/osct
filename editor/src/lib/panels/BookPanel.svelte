<script lang="ts">
  import { resolve } from "$app/paths";
  import { errorText, getBook, type BookTree } from "#lib/api.js";
  import BookTexts from "#lib/BookTexts.svelte";

  /**
   * The Inspector while the book is selected (#237 – the top bar's book crumb): the book's texts (title, author,
   * publisher – `BookTexts`) and where its content files live; *All spreads* leads to the book page.
   */
  let { bookId }: { bookId: string } = $props();

  let tree = $state<BookTree | null>(null);
  let error = $state<string | null>(null);
  $effect(() => {
    const id = bookId;
    getBook(id).then(t => (tree = t), e => (error = errorText(e)));
  });
  const reload = () => void getBook(bookId).then(t => (tree = t));
</script>

<div class="head">
  <span class="section-label grow">book</span>
  <a class="text-link small" href={resolve(`${bookId}/`)} title="The book page: every spread as its sheet">All spreads</a>
</div>
{#if error}
  <p class="small danger">{error}</p>
{:else if !tree}
  <p class="small muted">Loading the book…</p>
{:else}
  {#key tree.book.id}
    <BookTexts {bookId} book={tree.book.book} onsaved={reload} />
  {/key}
  <div class="row" data-help-name="Assets" data-help="Where the book's content files (the layout, the imported pictures, models and videos) are read from – set by the import; empty: the draft's own origin.">
    <span class="label">assets</span><span class="value small muted" title={tree.book.assetsBase || "the draft's origin"}>{tree.book.assetsBase || "the draft's origin"}</span>
  </div>
{/if}

<style>
  .head { display: flex; align-items: center; gap: .5rem; min-height: var(--control-height); }
  .grow { flex: 1; }
  .value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
