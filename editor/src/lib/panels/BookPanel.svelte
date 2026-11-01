<script lang="ts">
  import { resolve } from "$app/paths";
  import { errorText, getBook, type BookTree } from "#lib/api.js";
  import BookTexts from "#lib/BookTexts.svelte";
  import { SOURCES_OF_TRUTH, type SourceOfTruth } from "@shared/types/game-config";
  import { bookSource } from "#lib/book-source.svelte.js";
  import Section from "#lib/components/Section.svelte";
  import Segmented from "#lib/components/Segmented.svelte";

  /**
   * The Inspector while the book is selected (#237 – the top bar's book crumb): the book's texts (title, author,
   * publisher – `BookTexts`), its **source of truth** (#238: print first or digital first – saved when chosen,
   * `bookSource`) and where its content files live; *All spreads* leads to the book page.
   */
  let { bookId }: { bookId: string } = $props();

  let tree = $state<BookTree | null>(null);
  let error = $state<string | null>(null);
  $effect(() => {
    const id = bookId;
    getBook(id).then(t => (tree = t), e => (error = errorText(e)));
  });
  const reload = () => void getBook(bookId).then(t => (tree = t));

  $effect(() => {
    const id = bookId;
    if (bookSource.bookId !== id) void bookSource.load(id);
  });
  let sourceBusy = $state(false);
  let sourceError = $state<string | null>(null);
  const setSource = async (value: SourceOfTruth) => {
    if (value === bookSource.value) return;
    sourceBusy = true;
    sourceError = null;
    try {
      await bookSource.set(bookId, value);
      reload();
    } catch (e) {
      sourceError = errorText(e);
    } finally {
      sourceBusy = false;
    }
  };
  const SOURCE_LABELS: Record<SourceOfTruth, string> = { print: "print first", digital: "digital first" };
  const SOURCE_HELP = "Where the book's spreads come from. Print first: the printed book is the truth – its spreads, pages and printed placements come from an import of the layout, so the editor adds and removes no spreads. Digital first: the editor is the truth – spreads are added (the add tile on the book page, + after the last spread, the tree's spread menu) and removed here. An imported book starts print first.";
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
  <Section id="book.source" label="source of truth" summary={SOURCE_LABELS[bookSource.value]} help={SOURCE_HELP}>
    <div class="row" data-help-name="Source of truth" data-help={SOURCE_HELP}>
      <span class="label">spreads</span>
      <span class="controls"><Segmented options={SOURCES_OF_TRUTH} value={bookSource.bookId === bookId ? bookSource.value : null} labels={SOURCE_LABELS}
        titles={{ print: "The printed book is the truth: spreads come from the layout's import", digital: "The editor is the truth: spreads are added and removed here" }}
        label="Source of truth" onchange={v => void setSource(v)} /></span></div>
    <div class="row"><span class="label"></span>
      <span class="small muted">{bookSource.digital ? "made in the editor – spreads are added and removed here" : "from the printed layout – spreads come with an import"}</span></div>
    {#if sourceBusy}<p class="small muted">Saving…</p>{/if}
    {#if sourceError}<p class="small danger">{sourceError}</p>{/if}
  </Section>
  <div class="row" data-help-name="Assets" data-help="Where the book's content files (the layout, the imported pictures, models and videos) are read from – set by the import; empty: the draft's own origin.">
    <span class="label">assets</span><span class="value small muted" title={tree.book.assetsBase || "the draft's origin"}>{tree.book.assetsBase || "the draft's origin"}</span>
  </div>
{/if}

<style>
  .head { display: flex; align-items: center; gap: .5rem; min-height: var(--control-height); }
  .grow { flex: 1; }
  .value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
