<script lang="ts">
  import { onMount, tick } from "svelte";
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { deleteSpread, errorText, getBook, type BookTree, type ScenePlace, type TreeSpread } from "#lib/api.js";
  import { removeBlockedBy } from "#lib/spread-edit.js";
  import { removalStep, type RemovalStep } from "#lib/removal.js";
  import RemovalConfirm from "#lib/components/RemovalConfirm.svelte";
  import ContextMenu, { type MenuItem } from "#lib/components/ContextMenu.svelte";
  import type { Point } from "#lib/context-menu.js";
  import type { StageLayout } from "#lib/stage/stage-layout.js";
  import { fetchBookLayout } from "#lib/sheet-preview.js";
  import { pageImages } from "#lib/page-images.svelte.js";
  import PagesView from "#lib/PagesView.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import InfoView from "#lib/components/InfoView.svelte";
  import SceneCards from "#lib/SceneCards.svelte";
  import { PRESET_LABELS } from "#lib/ScenesPanel.svelte";
  import { scenes } from "#lib/scenes.svelte.js";
  import { groupedOf, runCounts, sceneName, stripKey, type MoveRequest } from "#lib/scene-strip.js";
  import { captionOf } from "#lib/spread-grid.js";
  import { SCENE_PRESETS } from "@shared/api/editor";

  /**
   * A book: its title and author, then its **scenes** (#307 phase 3a) as cards – the same cards as the Scenes panel under
   * the stage (`SceneCards`, `scene-strip.ts`), here in rows with each group a headed section: the scene's picture (the
   * layout's sheet with the targets' prints, #153, or its surfaces), its name and target count. A click opens the scene's
   * stage; cards and groups are dragged to reorder, Shift / Ctrl pick several, Ctrl+G groups them, Ctrl+Shift+G ungroups;
   * a card's menu adds a scene after it from a layout preset or removes it (two steps, #198) – in print-first and
   * digital-first books alike. **+ Scene…** and the add tile add one at the end. The book's texts and settings are the
   * Inspector's (the top bar's ⚙ in a scene, #237). The **Pages** view (`?view=pages`, #251) lists every page with its
   * page image (`PagesView`) until phase 3b turns them into surface references; any other `?view=` shows the scenes.
   */
  const bookId = $derived(page.params.book!);
  /** Scenes or Pages (#251), kept in the URL – `spreads` stays the scenes' value, so older links still open them */
  const VIEWS = ["spreads", "pages"] as const;
  const view = $derived(page.url.searchParams.get("view") === "pages" ? "pages" : "spreads");
  const setView = (next: (typeof VIEWS)[number]) => {
    void goto(`${resolve(`${bookId}/`)}${next === "pages" ? "?view=pages" : ""}`, { replace: true });
  };
  /** The book's page images over the cards (#251) */
  const pageImageUrls = $derived(pageImages.bookId === bookId ? pageImages.byKey : {});
  let tree = $state<BookTree | null>(null);
  let layout = $state<StageLayout | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  /** An action on the scenes; its failure shows above the cards */
  const run = async (action: () => Promise<unknown>) => {
    error = null;
    busy = true;
    try {
      await action();
      tree = scenes.tree;
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  };
  const openScene = (id: string) => void goto(resolve(`${bookId}/${id}/`));
  const move = (request: MoveRequest) => void run(() => scenes.move(request));
  const group = () => void run(() => scenes.groupPicked());
  const ungroup = () => void run(() => scenes.ungroup(null));
  const canGroup = $derived(scenes.picks.picked.length > 0);
  const canUngroup = $derived(groupedOf(scenes.list, scenes.picks.picked).length > 0);

  /** Ctrl+G / Ctrl+Shift+G anywhere on the page but in a field (the cards handle their own and stop them) */
  const windowKey = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
    const key = stripKey(event);
    if (key !== "group" && key !== "ungroup") return;
    event.preventDefault();
    if (key === "group" ? canGroup : canUngroup) {
      if (key === "group") group();
      else ungroup();
    }
  };

  // ── adding: a layout preset, after a card (its menu) or at the end (+ Scene…, the add tile) ──
  let addMenu = $state<{ at: Point; place?: ScenePlace; head: string } | null>(null);
  let addButton = $state<HTMLButtonElement>();
  const presetItems = (place?: ScenePlace): MenuItem[] => SCENE_PRESETS.map(preset => ({
    label: PRESET_LABELS[preset],
    select: () => void run(async () => {
      const id = await scenes.add(preset, preset === "cover" || preset === "back" ? undefined : place);
      await tick();
      document.querySelector<HTMLElement>(`[aria-label="Scenes"] [data-scene-index="${scenes.list.findIndex(s => s.id === id)}"]`)?.scrollIntoView({ block: "nearest" });
    }),
  }));

  // ── a card's menu (#196): right click, a long press or the menu key ──
  let menu = $state<{ scene: TreeSpread; at: Point } | null>(null);
  /** The card whose menu is open, for the focus to come back to (read when the menu closes, after `menu` is gone) */
  let menuCard = $state.raw<HTMLElement | null>(null);
  const menuItems = (scene: TreeSpread): MenuItem[] => [
    { label: "Open", icon: "open", help: "Opens the scene's stage.", select: () => openScene(scene.id) },
    { label: "Add a scene after…", icon: "plus", select: () => (addMenu = { at: menu?.at ?? { x: 0, y: 0 }, place: { after: scene.id }, head: `After ${sceneName(scene)}` }),
      help: "Adds a scene right after this one, from a layout: a single or double page, a fold-out, a wall – a front cover goes first, a back cover last. Nothing renumbers." },
    { label: "Remove", icon: "trash", danger: true, disabled: removeBlockedBy(scene, tree?.book.initialSpreadId), select: () => void askRemove(scene),
      help: "Removes this scene with its entries, targets and the entities used only there – it shows what goes and asks first. Library files are kept unless you choose to delete the ones used only here. The scene the book opens on stays." },
  ];

  /** The scene whose removal is being asked about, with the API's impact – no browser dialog (#198) */
  let confirming = $state<{ scene: TreeSpread; step: RemovalStep } | null>(null);
  let removing = $state(false);
  let removeError = $state<string | null>(null);
  /** The first step: the API answers 409 with what the removal takes and a confirmation id, and removes nothing */
  const askRemove = async (scene: TreeSpread) => {
    error = null;
    removeError = null;
    try {
      await deleteSpread(bookId, scene.id);
    } catch (e) {
      const step = removalStep(e);
      if (step) confirming = { scene, step };
      else error = errorText(e);
    }
  };
  /** The second step: the same removal with the confirmation id; a void id brings the fresh impact to confirm again */
  const removeScene = async (deleteFiles: boolean) => {
    if (!confirming) return;
    const scene = confirming.scene;
    removing = true;
    removeError = null;
    try {
      await deleteSpread(bookId, scene.id, confirming.step.confirmation.id, deleteFiles);
      confirming = null;
      await scenes.load(bookId);
      tree = scenes.tree;
    } catch (e) {
      const step = removalStep(e);
      if (step) confirming = { scene, step };
      else removeError = errorText(e);
    } finally {
      removing = false;
    }
  };
  const assetsBase = $derived((tree?.book.assetsBase ?? "").replace(/\/+$/, ""));

  onMount(async () => {
    try {
      await scenes.load(bookId, true);
      if (scenes.error) throw scenes.error;
      tree = scenes.tree;
    } catch (e) {
      error = errorText(e);
      return;
    }
    // The layout lives with the book's assets; without it (or without an assets base) the cards are blank pages with their prints
    layout = await fetchBookLayout(assetsBase);
  });
  $effect(() => {
    if (pageImages.bookId !== bookId) void pageImages.load(bookId);
  });
  const totals = $derived(runCounts(scenes.list));
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
</script>

<svelte:window onkeydown={e => { if (view !== "pages") windowKey(e); }} />

<main>
  {#if error}<p class="danger">{error}</p>{/if}
  {#if tree}
    <header class="book-head">
      <h1>{tree.book.title}</h1>
      <p class="muted">{tree.book.author}</p>
      <span class="views"><Segmented options={VIEWS} value={view} label="View" labels={{ spreads: "Scenes", pages: "Pages" }}
        titles={{ spreads: "The book's scenes as cards, groups as sections – open, drag, group, add, remove", pages: "Every page with its page image: upload, replace, move, rename, remove – one or many at once" }}
        onchange={setView} /></span>
    </header>
    {#if view === "pages"}
      <PagesView {bookId} {tree} {layout} {assetsBase} onspreadschanged={async () => { tree = await getBook(bookId, { fresh: true }); await scenes.load(bookId, true); }} />
    {:else}
      <div class="tools">
        <span class="muted small">{[count(totals.scenes, "scene"), count(scenes.groups.length, "group"), count(totals.targets, "target"), scenes.picks.picked.length ? `${scenes.picks.picked.length} picked` : ""].filter(Boolean).join(" · ")}</span>
        <span class="grow"></span>
        <button type="button" class="pill" bind:this={addButton} disabled={busy}
          onclick={() => { const r = addButton!.getBoundingClientRect(); addMenu = { at: { x: r.left, y: r.bottom }, head: "A new scene at the end" }; }}
          data-help-name="+ Scene…" data-help="Adds a scene at the end from a layout: a single or double page, a fold-out, a wall – a front cover goes first, a back cover last.">+ Scene…</button>
        <button type="button" class="pill" disabled={busy || !canGroup} onclick={group} title="Group the picked scenes (Ctrl+G)"
          data-help-name="Group" data-help="Makes a group of the picked scenes (Ctrl+G – Shift or Ctrl+click picks them): they come together where the first of them is. A group is one stop of the reader's switcher and one loading window.">Group <kbd>Ctrl+G</kbd></button>
        <button type="button" class="pill" disabled={busy || !canUngroup} onclick={ungroup} title="The picked scenes leave their group (Ctrl+Shift+G)"
          data-help-name="Ungroup" data-help="The picked scenes leave their group, in place (Ctrl+Shift+G). A whole group is ungrouped in the Inspector of a scene's workspace (click its band in the Scenes panel).">Ungroup <kbd>Ctrl+Shift+G</kbd></button>
      </div>
      {#if confirming}
        <div class="confirm">
          <p class="small">Remove the scene <b>{captionOf(confirming.scene) || sceneName(confirming.scene)}</b>?</p>
          <RemovalConfirm step={confirming.step} busy={removing} error={removeError}
            onconfirm={deleteFiles => void removeScene(deleteFiles)} oncancel={() => { confirming = null; menuCard?.focus(); }} />
        </div>
      {/if}
      <SceneCards layout="grid" sheetLayout={layout} pageImages={pageImageUrls} {assetsBase} onopen={openScene} onmove={move} ongroup={group} onungroup={ungroup}
        onmenu={(scene, at, card) => { confirming = null; menuCard = card; menu = { scene, at }; }}
        onadd={at => (addMenu = { at, head: "A new scene at the end" })} />
      {#if menu}
        <ContextMenu at={menu.at} label="Scene {sceneName(menu.scene)}" head={captionOf(menu.scene) || sceneName(menu.scene)}
          items={menuItems(menu.scene)} returnFocus={menuCard} onclose={() => (menu = null)} />
      {/if}
      {#if addMenu}
        <ContextMenu at={addMenu.at} label="Add a scene" head={addMenu.head} items={presetItems(addMenu.place)} returnFocus={addButton} onclose={() => (addMenu = null)} />
      {/if}
    {/if}
  {:else if !error}
    <p class="muted">Loading…</p>
  {/if}
</main>

<aside class="info-dock"><InfoView /></aside>

<style>
  main { padding: 1rem 1.5rem; }
  .book-head { margin-bottom: .75rem; }
  .book-head .views { display: block; margin-top: .5rem; }
  .book-head h1 { margin: 0; font-size: 1rem; font-weight: 600; }
  .book-head p { margin: .125rem 0 0; }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; margin: .5rem 0 1rem; }
  .tools .grow { flex: 1; }
  kbd { font: inherit; color: var(--muted); margin-left: .25rem; }
  .confirm { margin: 0 0 1rem; padding: .5rem; border: 1px dashed var(--line); max-width: 32rem; }
  .confirm p { margin: 0 0 .25rem; }
  .info-dock { position: fixed; left: 0; bottom: 0; z-index: 2; width: var(--tree-width); border-right: 1px solid var(--line); }
  /* Room below the last row: its caption scrolls clear of the Info dock */
  @media (min-width: 48rem) { main { padding-bottom: 13rem; } }
  /* A phone has no pointer to describe controls for */
  @media (max-width: 47.9rem) { .info-dock { display: none; } main { padding: .75rem 1rem; } }
</style>
