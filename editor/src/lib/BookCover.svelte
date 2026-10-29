<script lang="ts">
  import { onMount } from "svelte";
  import { getBook, type BookSummary } from "$lib/api";
  import { coverSheetOf, fetchBookLayout, pageOf, printBoxes, sheetUrl, type PrintBox } from "$lib/sheet-preview";
  import type { StageLayout } from "$lib/stage/stage-layout";
  import SheetPreview from "$lib/components/SheetPreview.svelte";

  /**
   * A book's front cover as a picture (#153): the layout's `cover-front` sheet with the cover spread's prints over it;
   * a typographic cover (the title and the author in the book's gold, on the cover's halftone) when the book has no
   * layout. Loaded when the card is shown, the layout and the book's tree side by side.
   */
  let { book }: { book: BookSummary } = $props();

  let layout = $state<StageLayout | null>(null);
  let prints = $state<PrintBox[]>([]);
  let loaded = $state(false);

  onMount(() => {
    void Promise.all([
      fetchBookLayout(book.assetsBase).then(value => (layout = value)),
      getBook(book.id)
        .then(tree => tree.spreads.find(spread => spread.format === "cover")?.entries.flatMap(entry => (entry.target ? [entry.target] : [])) ?? [])
        .catch(() => []),
    ]).then(([, targets]) => {
      prints = printBoxes(targets, 1, pageOf(layout), book.assetsBase);
      loaded = true;
    });
  });

  const page = $derived(pageOf(layout));
  const sheet = $derived(coverSheetOf(layout));
</script>

<span class="cover" class:loaded>
  <SheetPreview ratio={page.width / page.height} image={sheet ? sheetUrl(book.assetsBase, sheet) : null} {prints}>
    {#snippet fallback()}
      {#if loaded}
        <span class="type">
          <span class="gold title">{book.title}</span>
          <span class="gold author">{book.author}</span>
        </span>
      {/if}
    {/snippet}
  </SheetPreview>
</span>

<style>
  .cover { display: block; opacity: 0; transition: opacity .25s; }
  .cover.loaded { opacity: 1; }
  /* The printed cover's look (agents/DESIGN.md): white, a faint halftone, the title at the top and the author at the foot in the gold gradient */
  .type { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; align-items: center;
    padding: 9cqw 8cqw 10cqw; text-align: center;
    background: radial-gradient(circle, #ececec 0.5px, transparent 0.8px) 0 0 / 1cqw 1cqw, #fff; }
  .gold { background: linear-gradient(90deg, #f5e7c8 0%, #f5e7c8 3.8%, #7f6032 31.5%, #d2ae5a 57%, #f3cc94 73.6%, #f3cc94 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent; line-height: 1.1; }
  .title { font-size: 9cqw; }
  .author { font-size: 6cqw; }
</style>
