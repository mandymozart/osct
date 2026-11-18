<script lang="ts" module>
  import type { ScenePreset } from "@shared/api/editor";

  /** The presets of "+ Scene…" in words (`Scenes::PRESETS`, schema 3.0) */
  export const PRESET_LABELS: Record<ScenePreset, string> = {
    double: "Double page",
    single: "Single page",
    wall: "Wall",
  };
</script>

<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import ContextMenu, { type MenuItem } from "#lib/components/ContextMenu.svelte";
  import type { Point } from "#lib/context-menu.js";
  import SceneCards from "#lib/SceneCards.svelte";
  import { scenes } from "#lib/scenes.svelte.js";
  import { gridColumns, groupedOf, stripKey, type MoveRequest } from "#lib/scene-strip.js";
  import { PAGE_MM } from "#lib/surface-edit.js";
  import { errorText, type ScenePlace } from "#lib/api.js";
  import { readStoredJson, writeStoredJson } from "#lib/storage.js";
  import { SCENE_PRESETS } from "@shared/api/editor";

  /**
   * The **Scenes panel** (#307 phase 3a, `agents/design/scenes-filmstrip.html`): a filmstrip at the bottom of the stage
   * column – the experience's scenes as cards, groups as bands (`SceneCards`). Its head: ▾ collapses it, the book's name
   * and counts, **+ Scene…** (a layout preset, after the open scene), **Group** (Ctrl+G) and **Ungroup** (Ctrl+Shift+G)
   * for the picked scenes (one toggle: group / ungroup). The sash above it is dragged to resize it (double-click: the default). Open, height
   * and zoom are remembered in this browser. A drop is written at once (`POST …/scenes/move`, the drop is the
   * confirmation); the workspace follows `scenes.version` (the draft's order for ‹ ›). In a floating panel
   * (`floating`, #308) the panel's head folds it and its edges resize it: no ▾ and no sash here, the strip fills the panel
   * and its cards scale with the panel's height. **Filmstrip or grid** (#315, the head's switch, remembered here): the
   * strip one row whose cards scale with the panel's height; the grid columns that wrap, as many as its width holds
   * (`gridColumns`: one when narrow, each column 88–168 px), its cards scaling with the width, scrolled down.
   */
  let { bookId, bookTitle = "", current, selectedGroup = null, assetsBase = "", floating = false, onopen, onselectgroup, onstep }: {
    bookId: string;
    bookTitle?: string;
    current: string;
    selectedGroup?: string | null;
    assetsBase?: string;
    /** Inside a floating panel: its size is the panel's */
    floating?: boolean;
    onopen: (sceneId: string) => void;
    onselectgroup: (groupId: string) => void;
    /** ‹ › the previous / next scene (moved here from the Inspector's head – Tilman, 2026-11-18) */
    onstep?: (direction: 1 | -1) => void;
  } = $props();

  const KEY = "osct-editor-scenes";
  const HEIGHT_DEFAULT = 152;
  /** The panel's least height: cards stay readable (#307 3c) */
  const HEIGHT_MIN = 130;
  /** The cards scale with the panel's height (no zoom buttons – #307 3c): the default height is scale 1 */
  const CARD_HEIGHT_PX = 57.6;
  const stored = readStoredJson(KEY) as { open?: boolean; height?: number; layout?: string } | null;
  let open = $state(stored?.open ?? true);
  let height = $state(typeof stored?.height === "number" ? stored.height : HEIGHT_DEFAULT);
  /** Filmstrip (the default) or grid (#315) */
  let layout = $state<"strip" | "grid">(stored?.layout === "grid" ? "grid" : "strip");
  const save = () => writeStoredJson(KEY, { open, height, layout });
  const setLayout = (next: "strip" | "grid") => {
    layout = next;
    save();
  };
  /** The grid's columns from the strip's width: its padding (.6rem each side) and the cards' gap (.75rem) */
  let stripWidth = $state(0);
  let stripHeight = $state(0);
  const grid = $derived.by(() => {
    const rem = typeof document === "undefined" ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const page = PAGE_MM;
    // Less a scrollbar's room, so the columns never make it scroll sideways
    // A whole row shows in a short panel: its height less the padding, a card's caption and a group's band
    const rowRoom = stripHeight ? stripHeight - 1.05 * rem - 1.3 * rem - 1.4 * rem : Infinity;
    return gridColumns(stripWidth - 1.2 * rem - 12, page.width / page.height, 0.75 * rem, rowRoom);
  });
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const maxHeight = () => Math.max(HEIGHT_MIN, Math.round(window.innerHeight * 0.5));
  /** In a floating panel: its height, measured */
  let floatingHeight = $state(0);
  const shownHeight = $derived(floating ? Math.max(floatingHeight, 1) : Math.min(Math.max(height, HEIGHT_MIN), maxHeight()));
  const zoom = $derived(Math.max(0.6, (shownHeight - (HEIGHT_DEFAULT - CARD_HEIGHT_PX)) / CARD_HEIGHT_PX));

  $effect(() => {
    const id = bookId;
    if (scenes.bookId !== id) void scenes.load(id, true);
  });

  let error = $state<string | null>(null);
  let busy = $state(false);
  const run = async (action: () => Promise<unknown>) => {
    error = null;
    busy = true;
    try {
      await action();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  };

  const move = (request: MoveRequest) => void run(() => scenes.move(request));
  const group = () => void run(async () => {
    const id = await scenes.groupPicked();
    if (id) onselectgroup(id);
  });
  const ungroup = () => void run(() => scenes.ungroup(selectedGroup && !groupedOf(scenes.list, scenes.picks.picked).length ? selectedGroup : null));
  const canGroup = $derived(scenes.picks.picked.length > 0);
  const canUngroup = $derived(!!selectedGroup || groupedOf(scenes.list, scenes.picks.picked).length > 0);
  /** The one toggle: ungroup when a group is selected or every picked scene is in one, else group */
  const ungroupMode = $derived(!!selectedGroup || (scenes.picks.picked.length > 0 && groupedOf(scenes.list, scenes.picks.picked).length === scenes.picks.picked.length));

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

  // ── + Scene…: a preset, after the open scene ──
  let addMenu = $state<{ at: Point; place?: ScenePlace } | null>(null);
  let addButton = $state<HTMLButtonElement>();
  const presetItems = (place?: ScenePlace): MenuItem[] => SCENE_PRESETS.map(preset => ({
    label: PRESET_LABELS[preset],
    select: () => void run(async () => {
      const id = await scenes.add(preset, place);
      onopen(id);
    }),
  }));
  const openAdd = (at: Point, place?: ScenePlace) => (addMenu = { at, place });

  // ── the sash: dragged up or down, ↑ ↓ when focused, a double-click restores the default ──
  let sizing = $state<{ y: number; height: number } | null>(null);
  const sashDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    sizing = { y: event.clientY, height: shownHeight };
    event.preventDefault();
  };
  const sashMove = (event: PointerEvent) => {
    if (sizing) height = Math.min(Math.max(sizing.height + sizing.y - event.clientY, HEIGHT_MIN), maxHeight());
  };
  const sashUp = () => {
    if (!sizing) return;
    sizing = null;
    save();
  };
  const sashKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    height = Math.min(Math.max(shownHeight + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 64 : 16), HEIGHT_MIN), maxHeight());
    save();
  };
  const toggle = () => {
    open = !open;
    save();
  };
</script>

<svelte:window onkeydown={windowKey} />

<section class="scenes" class:closed={!open && !floating} class:floating style:height={open && !floating ? `${shownHeight}px` : undefined} aria-label="Scenes" data-app-ui
  bind:clientHeight={floatingHeight}>
  {#if open && !floating}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div class="sash" class:on={!!sizing} role="separator" aria-orientation="horizontal" aria-label="Scenes panel height" tabindex="0"
      aria-valuenow={shownHeight} aria-valuemin={HEIGHT_MIN} data-help-name="Scenes panel height"
      data-help="Drag to make the Scenes panel taller or shorter (↑ ↓ when focused); remembered in this browser. A double-click restores the default."
      onpointerdown={sashDown} onpointermove={sashMove} onpointerup={sashUp} onpointercancel={sashUp}
      ondblclick={() => { height = HEIGHT_DEFAULT; save(); }} onkeydown={sashKey}></div>
  {/if}
  <div class="head">
    {#if !floating}
      <button type="button" class="icon-button" onclick={toggle} aria-expanded={open} aria-label={open ? "Collapse the Scenes panel" : "Open the Scenes panel"}
        title={open ? "Collapse the Scenes panel" : "Open the Scenes panel"}><Icon name={open ? "down" : "up"} /></button>
      <span class="section-label">Scenes</span>
    {/if}
    <span class="muted info">
      · {[bookTitle, count(scenes.list.length, "scene"), count(scenes.groups.length, "group"), scenes.picks.picked.length ? `${scenes.picks.picked.length} picked` : ""].filter(Boolean).join(" · ")}
    </span>
    {#if error}<span class="small danger err" role="alert">{error}</span>{/if}
    <span class="grow"></span>
    <button type="button" class="icon-button" bind:this={addButton} disabled={busy}
      onclick={() => { const r = addButton!.getBoundingClientRect(); openAdd({ x: r.left, y: r.bottom }, { after: current }); }}
      data-help-name="+ Scene…" data-help="Adds a scene after the open one, from a preset: a double page (one surface), a single page (a cover is a single scene first in the order) or a wall standing ahead." title="Add a scene" aria-label="Add a scene"><Icon name="file-plus" /></button>
    <span class="layouts" role="group" aria-label="Layout">
      <button type="button" class="icon-button" class:on={layout === "strip"} aria-pressed={layout === "strip"} onclick={() => setLayout("strip")}
        title="Filmstrip" aria-label="Filmstrip" data-help-name="Filmstrip" data-help="The scenes in one row that scrolls sideways; the cards grow with the panel's height. Remembered in this browser."><Icon name="film" /></button>
      <button type="button" class="icon-button" class:on={layout === "grid"} aria-pressed={layout === "grid"} onclick={() => setLayout("grid")}
        title="Grid" aria-label="Grid" data-help-name="Grid" data-help="The scenes in columns that wrap and scroll down – one column when the panel is narrow, more as it widens; the cards grow with its width, a double page spans two. Remembered in this browser."><Icon name="grid" /></button>
    </span>
    {#if ungroupMode}
      <button type="button" class="icon-button" disabled={busy || !canUngroup} onclick={ungroup} title="Ungroup (Ctrl+Shift+G)" aria-label="Ungroup"
        data-help-name="Ungroup" data-help="The picked scenes leave their group, in place (Ctrl+Shift+G) – with a group selected and no grouped scene picked, the group itself goes; its scenes stay where they are."><Icon name="folder-minus" /></button>
    {:else}
      <button type="button" class="icon-button" disabled={busy || !canGroup} onclick={group} title="Group the picked scenes (Ctrl+G)" aria-label="Group"
        data-help-name="Group" data-help="Makes a group of the picked scenes (Ctrl+G): they come together where the first of them is. A group is one stop of the reader's switcher and one loading window."><Icon name="folder" /></button>
    {/if}
    {#if onstep}
      <span class="steps" role="group" aria-label="Scenes">
        <button type="button" class="icon-button" onclick={() => onstep(-1)} title="Previous scene (←)" aria-label="Previous scene"><Icon name="previous" /></button>
        <button type="button" class="icon-button" onclick={() => onstep(1)} title="Next scene (→)" aria-label="Next scene"><Icon name="next" /></button>
      </span>
    {/if}
  </div>
  {#if open || floating}
    <div class="strip" bind:clientWidth={stripWidth} bind:clientHeight={stripHeight}>
      {#if scenes.tree}
        <SceneCards {layout} {current} {selectedGroup} {zoom} columns={grid.columns} cardHeight={grid.cardHeight} {assetsBase} {onopen} {onselectgroup}
          onmove={move} ongroup={group} onungroup={ungroup} onadd={at => openAdd(at)} />
      {:else}
        <p class="muted small loading">{scenes.error ? errorText(scenes.error) : "Loading the scenes…"}</p>
      {/if}
    </div>
  {/if}
  {#if addMenu}
    <ContextMenu at={addMenu.at} label="Add a scene" head={addMenu.place ? "A new scene after the open one" : "A new scene at the end"}
      items={presetItems(addMenu.place)} returnFocus={addButton} onclose={() => (addMenu = null)} />
  {/if}
</section>

<style>
  .scenes { position: relative; display: flex; flex-direction: column; min-height: 0; background: var(--surface); border-top: 1px solid var(--line); color: var(--text); }
  .sash { position: absolute; left: 0; right: 0; top: -.25rem; height: .5rem; z-index: 3; cursor: row-resize; touch-action: none; outline: none; }
  .sash::after { content: ""; position: absolute; left: 0; right: 0; top: calc(50% - 1px); height: 2px; background: var(--muted); opacity: 0; transition: opacity .1s; }
  .sash:focus-visible::after, .sash.on::after { opacity: 1; }
  @media (hover: hover) { .sash:hover::after { opacity: 1; } }
  .head { flex: none; display: flex; align-items: center; gap: .25rem; padding: .25rem .375rem; background: var(--surface-head); border-bottom: 1px solid var(--line); min-width: 0; }
  .closed .head { border-bottom: 0; }
  .scenes.floating { flex: 1; border-top: 0; background: none; }
  .section-label { text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-size: var(--text-small); }
  .info { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; font-size: var(--text-small); }
  .err { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .grow { flex: 1; }
  .steps, .layouts { display: inline-flex; flex: none; }
  .layouts { margin-right: .25rem; }
  .layouts .on { color: var(--accent); }
  .strip { flex: 1; min-height: 0; }
  .loading { padding: .5rem .75rem; margin: 0; }
</style>
