<script lang="ts" module>
  import type { IconName } from "./Icon.svelte";

  export interface MenuItem {
    label: string;
    icon?: IconName;
    /** Disabled, with its reason: the item stays focusable and says why, choosing it does nothing */
    disabled?: string | false | null;
    danger?: boolean;
    /** Its description in the Info view (`data-help`) */
    help?: string;
    select: () => void;
  }
</script>

<script lang="ts">
  import { onMount, tick } from "svelte";
  import Icon from "./Icon.svelte";
  import { nextMenuIndex, placeMenu, typeaheadIndex, type Point } from "#lib/context-menu.js";

  /**
   * The editor's context menu (the stage's right click, a spread card's right click / long press / menu key): a WAI-ARIA
   * menu at a point of the viewport, kept on the screen. The first item takes the focus; arrows, Home / End and the
   * first letter move it, Enter or Space chooses, Esc, Tab, a click beside it or a scroll close it, and the focus goes
   * back to `returnFocus` (by default what had it before). Choosing an item closes the menu first, then runs it.
   */
  let { at, items, label, head, returnFocus, onclose }: {
    at: Point;
    items: readonly MenuItem[];
    /** The menu's accessible name */
    label: string;
    /** A line above the items naming what the menu is for */
    head?: string;
    returnFocus?: HTMLElement | null;
    onclose: () => void;
  } = $props();

  let menu = $state<HTMLDivElement>();
  let position = $state<Point>({ x: -9999, y: -9999 });
  let current = $state(-1);
  const previous = typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null);
  const id = `menu-${Math.random().toString(36).slice(2, 8)}`;

  const buttons = () => [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
  const focusItem = (i: number) => {
    current = i;
    buttons()[i]?.focus({ preventScroll: true });
  };

  onMount(() => {
    void tick().then(() => {
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      position = placeMenu(at, { width: rect.width, height: rect.height }, { width: window.innerWidth, height: window.innerHeight });
      focusItem(0);
    });
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    onclose();
    (returnFocus ?? previous)?.focus({ preventScroll: true });
  };
  /** The menu stays where it opened: a scroll that takes the page away from it closes it (a late scroll event of the
   *  focus that came before does not) */
  const scrolledFrom = typeof window === "undefined" ? { x: 0, y: 0 } : { x: window.scrollX, y: window.scrollY };
  const onScroll = () => {
    if (Math.hypot(window.scrollX - scrolledFrom.x, window.scrollY - scrolledFrom.y) > 24) close();
  };
  const choose = (i: number) => {
    const item = items[i];
    if (!item || item.disabled) return;
    close();
    item.select();
  };

  const onKeydown = (e: KeyboardEvent) => {
    const moved = nextMenuIndex(e.key, current, items.length);
    if (moved !== null) {
      e.preventDefault();
      return focusItem(moved);
    }
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      return close();
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return choose(current);
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const found = typeaheadIndex(items.map(item => item.label), current, e.key);
      if (found !== null) {
        e.preventDefault();
        focusItem(found);
      }
    }
  };
</script>

<svelte:window onscroll={onScroll} onresize={() => close()} />

<button type="button" class="menu-backdrop" tabindex="-1" aria-label="Close the menu" onclick={() => close()}
  oncontextmenu={e => { e.preventDefault(); close(); }}></button>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="menu" role="menu" tabindex="-1" aria-label={label} data-app-ui bind:this={menu} style:left="{position.x}px" style:top="{position.y}px"
  onkeydown={onKeydown} oncontextmenu={e => e.preventDefault()}>
  {#if head}<span class="menu-head small muted" aria-hidden="true">{head}</span>{/if}
  {#each items as item, i (item.label)}
    <button type="button" role="menuitem" class="menu-item" class:danger={item.danger} tabindex={i === current ? 0 : -1}
      aria-disabled={item.disabled ? "true" : undefined} aria-describedby={item.disabled ? `${id}-${i}` : undefined}
      data-help={item.help} onclick={() => choose(i)} onfocus={() => (current = i)}>
      {#if item.icon}<Icon name={item.icon} size="1em" stroke={2} />{/if}
      <span class="words">
        <span>{item.label}</span>
        {#if item.disabled}<span class="reason small muted" id="{id}-{i}">{item.disabled}</span>{/if}
      </span>
    </button>
  {/each}
</div>

<style>
  .menu-backdrop { position: fixed; inset: 0; z-index: 9; border: none; background: none; padding: 0; cursor: default; }
  .menu { position: fixed; z-index: 10; display: flex; flex-direction: column; min-width: 11rem; max-width: min(18rem, calc(100vw - 1rem)); padding: .25rem;
    border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); outline: none;
    -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; }
  .menu-head { padding: .25rem .625rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .menu-item { display: flex; align-items: center; gap: .5rem; min-height: var(--control-height); padding: 0 .625rem; border: none;
    border-radius: var(--control-radius); background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .menu-item:focus-visible { outline-offset: -2px; }
  @media (hover: hover) {
    .menu-item:hover:not([aria-disabled="true"]) { background: var(--hover-background); }
  }
  .menu-item.danger { color: var(--danger); }
  .menu-item[aria-disabled="true"] { color: var(--muted); cursor: not-allowed; }
  .menu-item :global(svg) { flex: none; }
  .words { display: flex; flex-direction: column; padding: .25rem 0; white-space: nowrap; }
  .reason { white-space: normal; }
</style>
