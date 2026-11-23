<script lang="ts" module>
  export interface LogicMenuItem {
    key: string;
    label: string;
    detail?: string;
    /** Why it cannot be chosen: shown, not chosen */
    disabled?: string | null;
    /** The header it is listed under; a new header starts where it changes */
    group?: string;
    /** Its type on the right, as the canvas legend shows it: the signal's pin and a word */
    signal?: import("#lib/logic/signals.js").DeckSignal;
    type?: string;
    select: () => void;
  }
</script>

<script lang="ts">
  import { onMount, tick } from "svelte";
  import { placeMenu, type Point } from "#lib/context-menu.js";
  import SignalPin from "./SignalPin.svelte";

  /**
   * The Logic canvas's right-click menu (#334 L-T4): a box's or a wire's actions, or – on the empty canvas, the panel's +
   * and a node dropped from the Library – what can be added here, with a **filter field on top** (the typeahead: typing
   * narrows the list, `emit fooBar` offers a new name). The items come from the panel (`logic/palette.ts`'s `addChoices`);
   * the menu only shows and chooses. Arrows move, Enter chooses the marked item, Esc or a click beside it closes. The add
   * menu's rows are one line each – the name on the left, its type on the right as the legend draws it (pin and word),
   * under the family's header; the detail is the row's tooltip, and only a grey line says why in words.
   */
  let { at, head, items, filter = false, placeholder = "Filter – or type emit name, set name, when name, rule on name", fieldLabel = "Filter what to add", query = $bindable(""), onclose }: {
    at: Point;
    head: string;
    items: readonly LogicMenuItem[];
    /** It has the filter field (the add menu) */
    filter?: boolean;
    /** The filter field's hint (the Tree's + menu has its own) */
    placeholder?: string;
    /** The field's name for a screen reader (a value field – the Logic panel's stage items, #334 – has its own) */
    fieldLabel?: string;
    query?: string;
    onclose: () => void;
  } = $props();

  let menu = $state<HTMLDivElement>();
  let field = $state<HTMLInputElement>();
  let position = $state<Point>({ x: -9999, y: -9999 });
  let current = $state(0);
  const choosable = $derived(items.map((item, i) => (item.disabled ? -1 : i)).filter(i => i >= 0));
  $effect(() => {
    void items;
    current = choosable[0] ?? -1;
  });

  onMount(() => {
    void tick().then(() => {
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      position = placeMenu(at, { width: rect.width, height: Math.max(rect.height, 240) }, { width: window.innerWidth, height: window.innerHeight });
      if (field) field.focus({ preventScroll: true });
      else menu.querySelector<HTMLButtonElement>("button:not([aria-disabled='true'])")?.focus({ preventScroll: true });
    });
    const away = (e: PointerEvent) => { if (menu && !menu.contains(e.target as Node)) onclose(); };
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  });

  const choose = (i: number) => {
    const item = items[i];
    if (!item || item.disabled) return;
    onclose();
    item.select();
  };
  const keydown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); onclose(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!choosable.length) return;
      const at = choosable.indexOf(current);
      current = choosable[(at + (e.key === "ArrowDown" ? 1 : choosable.length - 1)) % choosable.length];
      menu?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(current);
    }
  };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={menu} class="logic-menu" role="menu" tabindex="-1" aria-label={head} style:left="{position.x}px" style:top="{position.y}px" onkeydown={keydown}
  oncontextmenu={e => e.preventDefault()}>
  <div class="head small">{head}</div>
  {#if filter}
    <input bind:this={field} class="field" type="search" {placeholder} aria-label={fieldLabel}
      spellcheck="false" bind:value={query} />
  {/if}
  <ul>
    {#each items as item, i (item.key)}
      {#if item.group && item.group !== items[i - 1]?.group}
        <li class="group small" role="presentation">{item.group}</li>
      {/if}
      <li>
        <button type="button" role="menuitem" data-index={i} class:current={i === current} class:typed={!!item.type} aria-disabled={item.disabled ? "true" : undefined}
          title={item.disabled ?? item.detail ?? ""} onpointerenter={() => { if (!item.disabled) current = i; }} onclick={() => choose(i)}>
          <span class="label">{item.label}</span>
          {#if item.type}
            <span class="type">{#if item.signal}<SignalPin signal={item.signal} />{/if}{item.type}</span>
          {:else if item.disabled || item.detail}<span class="detail">{item.disabled ?? item.detail}</span>{/if}
        </button>
      </li>
    {:else}
      <li class="none small muted">Nothing fits “{query}”.</li>
    {/each}
  </ul>
</div>

<style>
  .logic-menu {
    position: fixed; z-index: 50; width: 18rem; max-height: 22rem; display: flex; flex-direction: column; gap: .25rem; padding: .25rem;
    background: var(--surface); border: 1px solid var(--line); box-shadow: 0 .25rem 1rem rgb(0 0 0 / .18); font-size: .75rem;
  }
  .head { color: var(--muted); padding: 0 .25rem; }
  ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; min-height: 0; }
  button {
    display: flex; flex-direction: column; align-items: flex-start; width: 100%; border: 0; background: none; padding: .25rem .375rem; font: inherit;
    color: var(--text); text-align: left; cursor: pointer;
  }
  button.current, button:focus-visible { background: var(--hover-background); outline: none; }
  button[aria-disabled="true"] { color: var(--muted); cursor: default; }
  button.typed { flex-direction: row; align-items: center; gap: .5rem; }
  button.typed .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .label { font-weight: 600; }
  .type { display: inline-flex; align-items: center; gap: .25rem; flex: none; font-size: .625rem; color: var(--muted); }
  .group { padding: .375rem .375rem .125rem; color: var(--muted); font-size: .625rem; font-weight: 600; }
  .group:first-child { padding-top: 0; }
  .detail { font-size: .625rem; color: var(--muted); }
  .none { padding: .25rem .375rem; }
</style>
