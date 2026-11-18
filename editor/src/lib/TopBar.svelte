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
  import SaveStatus from "#lib/SaveStatus.svelte";
  import { selection } from "#lib/selection.svelte.js";
  import Icon from "#lib/components/Icon.svelte";
  import ContextMenu, { type MenuItem } from "#lib/components/ContextMenu.svelte";
  import { goto } from "$app/navigation";
  import type { Point } from "#lib/context-menu.js";

  /**
   * The editor's one top bar (every page, drawn by the layout): the breadcrumb `Books › book › spread` at the left, the
   * book's search while a book is open (#237, `BookSearch`), where the draft stands (#259, `SaveStatus`: edits save
   * themselves), Publish (with its environment), then the account menu ☰ at the right: the e-mail, Admin and Sign out
   * (Tilman, 2026-11-18). The book's crumb always leads to the book page – the spreads overview (#274); in a spread's
   * workspace the ⚙ after it selects the book (#237): the Inspector shows its texts and settings. When the open
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

  /** The book's settings button in a workspace: the Inspector shows the book */
  const selectBook = () => selection.show({ target: null, node: [], onTarget: true, book: true });

  /** The open book's features the stage skips */
  const skipped = $derived(bookId && content.bookId === bookId ? content.skipped : []);
  /** The account menu: opened under its button, at the right edge */
  let menuAt = $state<Point | null>(null);
  let menuButton = $state<HTMLButtonElement | null>(null);
  const openMenu = () => {
    const box = menuButton?.getBoundingClientRect();
    menuAt = box ? { x: box.right, y: box.bottom + 4 } : { x: window.innerWidth, y: 40 };
  };
  const menuItems = $derived<MenuItem[]>([
    ...(session.isAdmin && !isAdminRoute ? [{ label: "Admin", icon: "settings" as const, help: "The instance's users and AI connections.", select: () => void goto(resolve("admin/")) }] : []),
    { label: "Sign out", icon: "open" as const, help: "Ends this session in this browser.", select: () => session.signOut() },
  ]);
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
      <a href={resolve(`${bookId}/`)} class="crumb" aria-current={spreadId ? undefined : "page"}
        title={spreadId ? "Back to all spreads" : undefined}>{titles[bookId] ?? bookId}</a>
      {#if spreadId}
        <button type="button" class="icon-button book-settings" class:on={selection.book} aria-pressed={selection.book} onclick={selectBook}
          aria-label="Book settings" title="The book's title, author, publisher and settings in the Inspector"><Icon name="settings" stroke={2} /></button>
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
    {#key bookId}<BookSearch {bookId} /><SaveStatus /><PublishButton {bookId} />{/key}
  {/if}
  <button type="button" class="icon-button account" bind:this={menuButton} onclick={openMenu} aria-haspopup="menu" aria-expanded={menuAt !== null}
    title={session.user?.email ?? "Account"} aria-label="Account menu" data-help-name="Account" data-help="Your account: Admin (for admins) and Sign out."><Icon name="menu" /></button>
  {#if menuAt}<ContextMenu at={menuAt} items={menuItems} label="Account" head={session.user?.email ?? undefined} returnFocus={menuButton} onclose={() => (menuAt = null)} />{/if}
</header>

<style>
  .top { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: .75rem; height: var(--top-height); padding: 0 .75rem; background: var(--surface-head); border-bottom: 1px solid var(--line); }
  .top a { text-decoration: none; }
  /* The search gives way before the crumbs: book and spread stay readable */
  .crumbs { flex: 1; display: flex; align-items: center; gap: .375rem; min-width: 14rem; white-space: nowrap; }
  .crumb { overflow: hidden; text-overflow: ellipsis; }
  a.crumb { color: var(--muted); }
  a.crumb[aria-current="page"], .crumb.current { color: var(--text); }
  @media (hover: hover) {
    a.crumb:hover { color: var(--text); }
  }
  .crumb[aria-current="page"] { font-weight: 600; }
  /* Short of room, Books gives way first: the book's crumb is the way back to the spreads */
  .crumbs > .crumb:first-child { flex-shrink: 4; }
  .crumbs > .crumb:nth-child(3) { min-width: 3rem; }
  .book-settings, .account { flex: none; }
  .sep { flex: none; color: var(--muted); }
  .crumb.spread { flex: none; }
  .skipped { position: relative; flex: none; }
  .skipped summary { cursor: pointer; white-space: nowrap; }
  .skipped ul { position: absolute; right: 0; top: calc(100% + .375rem); z-index: 30; width: max-content; max-width: min(32rem, calc(100vw - 1rem));
    margin: 0; padding: .5rem .75rem .5rem 1.5rem; border: 1px solid var(--line); background: var(--surface); color: var(--text); overflow-wrap: anywhere; }
  /* A full-height touch target: on a phone the book's crumb is the way back to the spreads */
  @media (pointer: coarse) { a.crumb { line-height: var(--control-height); } }
  @media (max-width: 47.9rem) {
    .top { gap: .375rem; padding: 0 .5rem; }
    .crumbs { min-width: 6rem; }
    /* Books › leaves first: the book's crumb (the way back) stays in a spread */
    .crumbs > :nth-child(-n + 2):not(:nth-last-child(-n + 3)) { display: none; }
    .crumbs { overflow: hidden; }
    .crumbs > :last-child { flex-shrink: 1; min-width: 0; }
  }
</style>
