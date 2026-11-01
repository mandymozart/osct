<script lang="ts">
  import { untrack } from "svelte";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { describeSkipped } from "@engine/content/game-config";
  import { getBook } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import { isAdminPath, session } from "#lib/session.svelte.js";
  import { captionOf, formatLabelOf, pagesOf } from "#lib/spread-grid.js";
  import PublishButton from "#lib/PublishButton.svelte";
  import BookSearch from "#lib/BookSearch.svelte";
  import { selection } from "#lib/selection.svelte.js";

  /**
   * The editor's one top bar (every page, drawn by the layout): the breadcrumb `Books › book › spread` at the left, the
   * book's search while a book is open (#237, `BookSearch`), Publish (with its environment), then Admin, the e-mail and
   * Sign out at the right. In a spread's workspace the book's crumb selects the book (#237): the Inspector shows its
   * texts and settings (a modified click still opens the book page). When the open
   * book's draft has features this editor's engine does not know (a newer content build – RULES #10), a small warning
   * opens their list: the stage shows the book without them.
   */
  const bookId = $derived(page.params.book ?? null);
  const spreadId = $derived(page.params.spread ?? null);
  const isAdminRoute = $derived(isAdminPath(page.url.pathname));

  /** Book titles by id, read once per book */
  const titles = $state<Record<string, string>>({});
  $effect(() => {
    const id = bookId;
    if (!id || untrack(() => id in titles)) return;
    titles[id] = id;
    getBook(id).then(tree => (titles[id] = tree.book.title || id), () => {});
  });

  const spread = $derived(spreadId && content.bookId === bookId ? content.spread(spreadId) : undefined);
  /** The spread's full name, never cut: `p. 12–13 · title`, a cover by its title (else its format) */
  const spreadLabel = $derived(!spread ? spreadId : formatLabelOf(spread) ? spread.title || formatLabelOf(spread) : `p. ${captionOf(spread) || pagesOf(spread)}`);

  /** In a workspace a plain click on the book's crumb selects the book instead of leaving the spread */
  const selectBook = (event: MouseEvent) => {
    if (!spreadId || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    selection.show({ target: null, node: [], onTarget: true, book: true });
  };

  /** The open book's features the stage skips */
  const skipped = $derived(bookId && content.bookId === bookId ? content.skipped : []);
  const SKIPPED_HELP = "This book was built with a newer content schema than this editor knows. The stage skips what it does not know – update the editor (a newer release) to see and edit everything.";
</script>

<header class="top" data-app-ui>
  <nav class="crumbs" aria-label="Breadcrumb">
    {#if session.isEditor}
      <a href={resolve("/(app)")} class="crumb" aria-current={!bookId && !isAdminRoute ? "page" : undefined}>Books</a>
    {:else}
      <span class="crumb">OSCT</span>
    {/if}
    {#if bookId}
      <span class="sep" aria-hidden="true">›</span>
      <a href={resolve(`${bookId}/`)} class="crumb" class:selected={!!spreadId && selection.book} aria-current={spreadId ? undefined : "page"}
        onclick={selectBook} title={spreadId ? "The book – a tap selects it: the Inspector shows its title, author, publisher and settings" : undefined}>{titles[bookId] ?? bookId}</a>
      {#if spreadId}
        <span class="sep" aria-hidden="true">›</span>
        <span class="crumb current spread" aria-current="page" title={spreadLabel}>{spreadLabel}</span>
      {/if}
    {:else if isAdminRoute}
      <span class="sep" aria-hidden="true">›</span>
      <span class="crumb current" aria-current="page">Admin</span>
    {/if}
  </nav>
  {#if skipped.length}
    <details class="skipped">
      <summary class="small danger" data-help-name="Unknown features" data-help={SKIPPED_HELP} title={SKIPPED_HELP}>{skipped.length} unknown {skipped.length === 1 ? "feature" : "features"}</summary>
      <ul class="small" aria-label="Skipped on the stage">{#each skipped as feature (`${feature.path} ${feature.kind}`)}<li>{describeSkipped(feature)}</li>{/each}</ul>
    </details>
  {/if}
  {#if bookId}
    {#key bookId}<BookSearch {bookId} /><PublishButton {bookId} />{/key}
  {/if}
  {#if session.isAdmin && !isAdminRoute}<a href={resolve("admin/")} class="pill admin" class:in-book={!!bookId}>Admin</a>{/if}
  <span class="muted small email">{session.user?.email}</span>
  <button type="button" class="pill sign-out" class:in-book={!!bookId} onclick={() => session.signOut()}>Sign out</button>
</header>

<style>
  .top { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: .75rem; height: var(--top-height); padding: 0 .75rem; background: var(--surface-head); border-bottom: 1px solid var(--line); }
  .top a { text-decoration: none; }
  .crumbs { flex: 1; display: flex; align-items: center; gap: .375rem; min-width: 0; white-space: nowrap; }
  .crumb { overflow: hidden; text-overflow: ellipsis; }
  a.crumb { color: var(--muted); }
  a.crumb[aria-current="page"], .crumb.current { color: var(--text); }
  @media (hover: hover) {
    a.crumb:hover { color: var(--text); }
  }
  .crumb[aria-current="page"] { font-weight: 600; }
  a.crumb.selected { color: var(--text); text-decoration: underline; text-underline-offset: .25em; }
  .sep { flex: none; color: var(--muted); }
  .crumb.spread { flex: none; }
  .skipped { position: relative; flex: none; }
  .skipped summary { cursor: pointer; white-space: nowrap; }
  .skipped ul { position: absolute; right: 0; top: calc(100% + .375rem); z-index: 30; width: max-content; max-width: min(32rem, calc(100vw - 1rem));
    margin: 0; padding: .5rem .75rem .5rem 1.5rem; border: 1px solid var(--line); background: var(--surface); color: var(--text); overflow-wrap: anywhere; }
  /* A full-height touch target: on a phone the book's crumb selects the book, its Inspector leads back to the spreads */
  @media (pointer: coarse) { a.crumb { line-height: var(--control-height); } }
  @media (max-width: 47.9rem) {
    .top { gap: .375rem; padding: 0 .5rem; }
    .crumbs { min-width: 6rem; }
    .crumbs > :not(:nth-last-child(-n + 3)) { display: none; }
    .crumbs > :last-child { flex-shrink: 0; max-width: 75%; }
    .email, .in-book { display: none; }
  }
</style>
