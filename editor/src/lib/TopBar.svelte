<script lang="ts">
  import { untrack } from "svelte";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { getBook } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import { session } from "#lib/session.svelte.js";
  import { captionOf, formatLabelOf, pagesOf } from "#lib/spread-grid.js";
  import PublishButton from "#lib/PublishButton.svelte";

  /**
   * The editor's one top bar (every page, drawn by the layout): the breadcrumb `Books › book › spread` at the left,
   * Publish (with its environment) while a book is open, then Admin, the e-mail and Sign out at the right.
   */
  const bookId = $derived(page.params.book ?? null);
  const spreadId = $derived(page.params.spread ?? null);
  const isAdminRoute = $derived(page.url.pathname.startsWith(resolve("admin/")) || `${page.url.pathname}/` === resolve("admin/"));

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
</script>

<header class="top" data-app-ui>
  <nav class="crumbs" aria-label="Breadcrumb">
    {#if session.isEditor}
      <a href={resolve("/")} class="crumb" aria-current={!bookId && !isAdminRoute ? "page" : undefined}>Books</a>
    {:else}
      <span class="crumb">OSCT</span>
    {/if}
    {#if bookId}
      <span class="sep" aria-hidden="true">›</span>
      <a href={resolve(`${bookId}/`)} class="crumb" aria-current={spreadId ? undefined : "page"}>{titles[bookId] ?? bookId}</a>
      {#if spreadId}
        <span class="sep" aria-hidden="true">›</span>
        <span class="crumb current spread" aria-current="page" title={spreadLabel}>{spreadLabel}</span>
      {/if}
    {:else if isAdminRoute}
      <span class="sep" aria-hidden="true">›</span>
      <span class="crumb current" aria-current="page">Admin</span>
    {/if}
  </nav>
  {#if bookId}
    {#key bookId}<PublishButton {bookId} />{/key}
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
  a.crumb:hover, a.crumb[aria-current="page"], .crumb.current { color: var(--text); }
  .crumb[aria-current="page"] { font-weight: 600; }
  .sep { flex: none; color: var(--muted); }
  .crumb.spread { flex: none; }
  /* A finger: a crumb link is a touch target of the full control height – on a phone the book's crumb is the way
     back to the spreads (the sheet's head has no × there, #171) */
  @media (pointer: coarse) { a.crumb { line-height: var(--control-height); } }
  @media (max-width: 47.9rem) {
    .top { gap: .375rem; padding: 0 .5rem; }
    .crumbs { min-width: 6rem; }
    .crumbs > :not(:nth-last-child(-n + 3)) { display: none; }
    .crumbs > :last-child { flex-shrink: 0; max-width: 75%; }
    .email, .in-book { display: none; }
  }
</style>
