<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import SurfacesPreview from "#lib/components/SurfacesPreview.svelte";
  import { menuTrigger } from "#lib/menu-trigger.js";
  import type { Point } from "#lib/context-menu.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import {
    bandDrop, dropAtEnd, dropMark, dropOver, gridSpan, pickModeOf, pickScenes, planDrop, runCounts, sceneName, stepScene, stripKey, stripRuns,
    targetsOf, type Drop, type MoveRequest,
  } from "#lib/scene-strip.js";
  import { previewParts } from "#lib/surface-preview.js";
  import { PAGE_MM } from "#lib/surface-edit.js";
  import type { TreeScene } from "#lib/api.js";
  import { GROUP_WINDOW_TARGETS } from "@shared/api/editor";

  /**
   * The scenes of the book as cards (#307 phase 3a): the Scenes panel's **strip** (`layout="strip"`, one row that
   * scrolls sideways, the default) or its **grid** (#315: page-wide `columns` that wrap and scroll down, a card spanning
   * its width in pages, `cardHeight` from the panel's width – `gridColumns`; a group a band over its own rows). Each card is
   * the scene's surfaces side by side, each with its reference image and the targets' prints (`surface-preview.ts`) – with
   * its name (its label) and its target count; the
   * open scene is framed in the text colour, the picked ones grey (the editor is monochrome). A group is a **band** over its scenes: its label, scene and target
   * count, a warning above the loading window (`GROUP_WINDOW_TARGETS`, #300). A click opens a scene (Shift picks a range,
   * Ctrl one more); a click on a band selects the group; cards – the picked ones together – and a whole band are dragged
   * along the cards: a line shows where they land, over a band's scene they join its group. ← → move the pick
   * (Shift: a range), Enter opens, Ctrl+G groups, Ctrl+Shift+G ungroups, Esc ends a drag. The model is `scene-strip.ts`,
   * the data and the actions `scenes.svelte.ts`; the page owns what a drop, a group and a card's menu do.
   */
  let {
    layout = "strip", current = null, selectedGroup = null, zoom = 1, columns = 1, cardHeight = 0, assetsBase = "",
    onopen, onselectgroup, onmove, ongroup, onungroup, onmenu, onadd,
  }: {
    layout?: "strip" | "grid";
    /** The open scene (the scene route), framed */
    current?: string | null;
    /** The group shown in the Inspector: its band highlighted */
    selectedGroup?: string | null;
    zoom?: number;
    /** The grid: its columns and its cards' height (px) */
    columns?: number;
    cardHeight?: number;
    assetsBase?: string;
    onopen: (sceneId: string) => void;
    onselectgroup?: (groupId: string) => void;
    onmove: (request: MoveRequest) => void;
    ongroup?: () => void;
    onungroup?: () => void;
    /** A card's menu (a right click, a long press, the menu key) – none: the cards have no menu */
    onmenu?: (scene: TreeScene, at: Point, card: HTMLElement) => void;
    /** The add tile at the end – none: no tile */
    onadd?: (at: Point) => void;
  } = $props();

  const list = $derived(scenes.list);
  const order = $derived(list.map(scene => scene.id));
  const runs = $derived(stripRuns(list, scenes.groups));
  /** A page's ratio: a grid column is one page wide */
  const pageRatio = PAGE_MM.width / PAGE_MM.height;
  const picked = $derived(new Set(scenes.picks.picked));

  /** The card the arrows move from: the last one picked or clicked, else the open scene */
  let cursor = $state<string | null>(null);
  const cards: Record<string, HTMLButtonElement> = {};
  let root = $state<HTMLDivElement>();
  /** The mouse wheel scrolls the strip sideways – up/down without Shift (#307 3c, Tilman) */
  $effect(() => {
    const el = root;
    if (!el || layout !== "strip") return;
    const wheel = (event: WheelEvent) => {
      if (event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      el.scrollLeft += event.deltaY;
      event.preventDefault();
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });
  /** The cards had the focus: a change that builds them again (a move, a group) gives it back to the cursor's card */
  let focused = false;
  const focusOut = (event: FocusEvent) => {
    const to = event.relatedTarget as Node | null;
    if (to && !root?.contains(to)) focused = false;
  };
  $effect(() => {
    void scenes.list;
    queueMicrotask(() => {
      const active = document.activeElement;
      if (focused && cursor && (!active || active === document.body)) cards[cursor]?.focus({ preventScroll: true });
    });
  });

  // ── a drag: a press becomes a drag after DRAG_PX; the cards under the pointer give the drop ──
  const DRAG_PX = 5;
  /** Near the strip's ends a drag scrolls it (px) */
  const EDGE_PX = 40;
  let press: { id: string; band: string | null; ids: string[]; x: number; y: number; pointerId: number } | null = null;
  let drag = $state<{ ids: string[]; band: string | null; drop: Drop | null; x: number; y: number; label: string } | null>(null);
  const mark = $derived(drag?.drop ? dropMark(list, drag.drop) : null);

  const pressCard = (event: PointerEvent, id: string) => {
    if (event.button !== 0) return;
    press = { id, band: null, ids: [], x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };
  const pressBand = (event: PointerEvent, groupId: string, ids: string[]) => {
    if (event.button !== 0) return;
    press = { id: ids[0], band: groupId, ids, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };
  const dropAt = (x: number, y: number): Drop | null => {
    const under = document.elementFromPoint(x, y);
    const card = under?.closest<HTMLElement>("[data-scene-index]");
    if (card && root?.contains(card)) {
      const rect = card.getBoundingClientRect();
      return dropOver(list, Number(card.dataset.sceneIndex), x > rect.left + rect.width / 2);
    }
    if (under?.closest(".add") || (root && under === root)) {
      const last = list.length ? cards[list[list.length - 1].id]?.getBoundingClientRect() : null;
      if (!last || x > last.right || y > last.bottom) return dropAtEnd(list);
    }
    return drag?.drop ?? null;
  };
  const move = (event: PointerEvent) => {
    if (press && !drag && event.pointerId === press.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_PX) {
      let ids = press.ids;
      if (!press.band) {
        if (!picked.has(press.id)) scenes.picks = { picked: [press.id], anchor: press.id };
        ids = scenes.picks.picked.includes(press.id) ? scenes.picks.picked : [press.id];
      }
      const first = scenes.scene(ids[0]);
      const label = press.band ? (scenes.group(press.band)?.label ?? press.band) : ids.length > 1 ? `${ids.length} scenes` : first ? sceneName(first) : "";
      drag = { ids, band: press.band, drop: null, x: event.clientX, y: event.clientY, label };
      root?.setPointerCapture(event.pointerId);
    }
    if (!drag) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (layout === "strip" && root) {
      const rect = root.getBoundingClientRect();
      if (event.clientX < rect.left + EDGE_PX) root.scrollLeft -= 12;
      else if (event.clientX > rect.right - EDGE_PX) root.scrollLeft += 12;
    }
    const drop = dropAt(event.clientX, event.clientY);
    drag.drop = drop && drag.band ? bandDrop(list, drop, drag.band) : drop;
  };
  const release = (event: PointerEvent) => {
    const ended = drag;
    press = null;
    drag = null;
    if (!ended || event.type !== "pointerup" || !ended.drop) return;
    const plan = planDrop(list, ended.ids, ended.drop, !!ended.band);
    if (plan.changed) onmove(plan.request);
  };

  // ── clicks and keys ──
  const clickCard = (scene: TreeScene, event: MouseEvent) => {
    const mode = pickModeOf(event);
    scenes.picks = pickScenes(order, scenes.picks, scene.id, mode);
    cursor = scene.id;
    if (mode === "only") onopen(scene.id);
  };
  const onkey = (event: KeyboardEvent) => {
    if (drag && event.key === "Escape") {
      drag = null;
      press = null;
      event.preventDefault();
      return;
    }
    const key = stripKey(event);
    if (!key || key === "open") return; // Enter: the focused card's own click
    event.preventDefault();
    event.stopPropagation(); // not the workspace's ← → through the scenes or its shortcuts
    if (key === "group") ongroup?.();
    else if (key === "ungroup") onungroup?.();
    else {
      const from = cursor && order.includes(cursor) ? cursor : (scenes.picks.picked.at(-1) ?? current);
      const next = stepScene(order, from, key.move);
      if (!next) return;
      scenes.picks = key.extend ? pickScenes(order, { ...scenes.picks, anchor: scenes.picks.anchor ?? from }, next, "range") : { picked: [next], anchor: next };
      cursor = next;
      cards[next]?.focus();
      cards[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  /** The open scene in view when the strip opens or another scene opens */
  $effect(() => {
    const id = current;
    if (id && layout === "strip") queueMicrotask(() => cards[id]?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  });

  /** The targets of a scene as the picture reads them */
  const targetsIn = (scene: TreeScene) => scene.entries.flatMap(e => (e.target?.imageSrc ? [e.target] : []));
</script>

{#snippet card(scene: TreeScene, index: number)}
  {@const picture = previewParts(scene.surfaces, scenes.references[scene.id], targetsIn(scene), assetsBase)}
  {@const ratio = picture?.ratio ?? pageRatio}
  {@const targets = targetsOf(scene)}
  <div class="slot" style:grid-column={layout === "grid" ? `span ${gridSpan(ratio, pageRatio, columns)}` : undefined} class:drop-before={mark?.index === index && mark.side === "before"} class:drop-after={mark?.index === index && mark.side === "after"}>
    <button type="button" class="card" data-scene-index={index} class:current={scene.id === current} class:picked={picked.has(scene.id)}
      class:dragged={drag?.ids.includes(scene.id)} aria-pressed={picked.has(scene.id)} aria-current={scene.id === current ? "page" : undefined}
      title={sceneName(scene)} bind:this={cards[scene.id]} draggable="false"
      data-help-name="Scene {sceneName(scene)}"
      data-help="A scene: a click opens it, Shift+click picks a range, Ctrl+click one more. Drag it – the picked scenes together – along the cards to move it; over a group's scene it joins the group. ← → move the pick, Enter opens.{onmenu ? ' Its menu (right click, long press, the menu key) adds a scene after it or removes it.' : ''}"
      style:width={layout === "grid" ? undefined : `calc(${ratio} * var(--card-height))`} onpointerdown={e => pressCard(e, scene.id)} onclick={e => clickCard(scene, e)}
      {@attach onmenu ? menuTrigger({ open: at => onmenu(scene, at, cards[scene.id]) }) : undefined}>
      <span class="th">
        {#if picture}<SurfacesPreview parts={picture.parts} ratio={picture.ratio} labels />{/if}
      </span>
      <span class="n"><b>{sceneName(scene)}</b><span class="count" aria-label="{targets} targets"><Icon name="target" size="1em" stroke={2} />{targets}</span></span>
    </button>
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="cards {layout}" role="group" aria-label="Scenes" bind:this={root} style:--zoom={zoom} class:dragging={!!drag}
  style:--cols={layout === "grid" ? columns : undefined} style:--grid-card-height={layout === "grid" && cardHeight ? `${cardHeight}px` : undefined}
  ondragstart={e => e.preventDefault()} onkeydown={onkey} onpointermove={move} onpointerup={release} onpointercancel={release} onfocusin={() => (focused = true)} onfocusout={focusOut}>
  {#each runs as run (`${run.start}:${run.group?.id ?? ""}`)}
    {#if run.group}
      {@const group = run.group}
      {@const counts = runCounts(run.scenes)}
      <div class="run grouped" class:selected={selectedGroup === group.id} class:target={!!drag && !drag.band && drag.drop?.group === group.id}>
        <button type="button" class="band" aria-pressed={selectedGroup === group.id}
          title="{group.label} – {counts.scenes} scenes, {counts.targets} targets{counts.over ? ` – more than the loading window holds at once (${GROUP_WINDOW_TARGETS})` : ''}"
          data-help-name="Group {group.label}" data-help="A group: one stop of the reader's switcher and one loading window. A click shows it in the Inspector (its label, its targets against the window, Ungroup); drag the band to move the whole group."
          onpointerdown={e => pressBand(e, group.id, run.scenes.map(s => s.id))} onclick={() => onselectgroup?.(group.id)}>
          <span class="label">{group.label}</span> · {counts.scenes} · <span class:warn={counts.over}>{counts.targets} targets{counts.over ? " ⚠" : ""}</span>
        </button>
        <div class="row">{#each run.scenes as scene, j (scene.id)}{@render card(scene, run.start + j)}{/each}</div>
      </div>
    {:else}
      <div class="run"><div class="row">{#each run.scenes as scene, j (scene.id)}{@render card(scene, run.start + j)}{/each}</div></div>
    {/if}
  {/each}
  {#if onadd}
    <button type="button" class="add" aria-label="Add a scene" title="Add a scene" onclick={e => onadd({ x: e.clientX, y: e.clientY })}
      data-help-name="Add a scene" data-help="Adds a scene at the end: a double page, a single page (a cover) or a wall."><Icon name="plus" /></button>
  {/if}
</div>
{#if drag}
  <div class="ghost" style:left="{drag.x + 12}px" style:top="{drag.y + 12}px" aria-hidden="true">{drag.label}</div>
{/if}

<style>
  .cards { --card-height: calc(3.6rem * var(--zoom, 1)); display: flex; gap: .55rem; user-select: none; -webkit-user-select: none; }
  .cards.strip { flex-wrap: nowrap; align-items: flex-end; overflow-x: auto; overflow-y: hidden; padding: .45rem .6rem .35rem; height: 100%; box-sizing: border-box; }
  /* The grid (#315): page-wide columns that wrap, scrolled down; a card fills the columns it spans */
  .cards.grid { --card-height: var(--grid-card-height, 7.5rem); flex-direction: column; gap: .75rem; overflow-x: hidden; overflow-y: auto; padding: .45rem .6rem .6rem; height: 100%; box-sizing: border-box; }
  .cards.dragging { cursor: grabbing; }
  .run { display: flex; flex-direction: column; gap: .2rem; flex: none; }
  .grid .run { flex: initial; }
  .row { display: flex; gap: .3rem; }
  .grid .row { display: grid; grid-template-columns: repeat(var(--cols, 1), minmax(0, 1fr)); gap: .75rem; }
  .grid .slot { min-width: 0; }
  .grid .card { width: 100%; min-width: 0; }
  .band { all: unset; box-sizing: border-box; cursor: pointer; font-size: var(--text-small); color: var(--accent); border-top: 3px solid var(--accent); padding: .1rem .25rem 0; white-space: nowrap; }
  .grid .band { padding: .2rem .25rem .1rem; }
  .band .label { font-weight: 600; }
  .band:focus-visible { outline: 1px solid var(--accent); }
  .run.selected > .band { background: var(--accent-background); color: var(--text); }
  .run.target > .band { background: var(--accent-background); }
  .band .warn { color: var(--warn); }
  @media (hover: hover) { .band:hover { background: var(--accent-background); } }
  .slot { position: relative; display: flex; }
  .slot.drop-before::before, .slot.drop-after::after { content: ""; position: absolute; top: -.25rem; bottom: .875rem; width: 3px; background: var(--accent); z-index: 1; }
  .slot.drop-before::before { left: -.2rem; }
  .slot.drop-after::after { right: -.2rem; }
  .card { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: .12rem; cursor: pointer; font-size: var(--text-small); color: var(--muted); touch-action: pan-x; }
  .grid .card { touch-action: pan-y; }
  .th { display: block; width: 100%; height: var(--card-height); border: 1px solid var(--line); background: #fff; overflow: hidden; }
  .th :global(.scene) { height: 100%; }
  /* A picture is never dragged by the browser: that would cancel the pointer drag */
  .card :global(img) { -webkit-user-drag: none; pointer-events: none; }
  .card.current .th { outline: 2px solid var(--accent); outline-offset: 1px; }
  .card.picked .th { outline: 2px solid var(--pick); outline-offset: 1px; }
  .card.current.picked .th { outline-color: var(--accent); box-shadow: 0 0 0 4px var(--pick); }
  .card.dragged { opacity: .35; }
  .card:focus-visible .th { outline: 2px solid var(--text); outline-offset: 1px; }
  @media (hover: hover) { .card:hover .th { border-color: var(--text); } }
  .n { display: flex; justify-content: space-between; gap: .3rem; white-space: nowrap; min-width: 0; }
  .n b { min-width: 0; color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
  .count { flex: none; }
  .count { display: inline-flex; align-items: center; gap: .125rem; }
  .add { all: unset; box-sizing: border-box; cursor: pointer; flex: none; display: grid; place-items: center; width: 3.2rem; align-self: stretch; margin-bottom: 1.15rem; border: 1px dashed var(--line); color: var(--muted); }
  /* One column wide, a card high */
  .grid .add { width: calc((100% - (var(--cols, 1) - 1) * .75rem) / var(--cols, 1)); height: var(--card-height); margin-bottom: 1.15rem; align-self: flex-start; }
  @media (hover: hover) { .add:hover { border-color: var(--text); color: var(--text); } }
  .add:focus-visible { border-color: var(--text); color: var(--text); }
  .ghost { position: fixed; z-index: 50; pointer-events: none; transform: rotate(-4deg); padding: .25rem .5rem; background: var(--surface); color: var(--text); border: 2px solid var(--pick); box-shadow: 0 .4rem 1rem #000a; font-size: var(--text-small); white-space: nowrap; }
</style>
