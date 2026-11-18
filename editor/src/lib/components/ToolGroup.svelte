<script lang="ts" module>
  import type { IconName } from "./Icon.svelte";
  import type { ToolOption } from "#lib/tool-groups.js";

  export type ToolGroupOption = ToolOption & { icon: IconName };
</script>

<script lang="ts">
  import { tick } from "svelte";
  import Icon from "./Icon.svelte";
  import { activeIndex, activeOption, menuStep } from "#lib/tool-groups.js";

  /**
   * One group of the stage toolbar (#180), after a 3D tool's tool groups: **collapsed**, one button with the active
   * option's icon (a small corner mark says it opens more); a tap opens the options in a menu attached to it, a choice
   * closes it. **Expanded** (the toolbar has room), the options side by side as pressed toggles. Every option carries
   * its name as tooltip and label (the Info view's help). The menu is a WAI-ARIA menu of radio items: ↑ ↓ (← →) move,
   * Home / End, Enter or Space choose, Esc or Tab close – Esc and a choice return the focus to the button; a tap
   * outside closes it (the backdrop takes that tap, so it picks nothing on the stage). It is fixed to the screen,
   * so a short stage (the phone's sheet almost full) does not clip it. With `selected` the group is a set of
   * **toggles** (the select tool's filters, #308): each option on or off, the menu's items are checkboxes and stay open
   * after a choice; collapsed, its button shows the one option on, else `icon`.
   */
  let { label, options, value = "", selected, icon, expanded = false, tight = false, stroke = 2, onchoose }: {
    /** The group's name ("Transform") */
    label: string;
    options: readonly ToolGroupOption[];
    /** The active option's value */
    value?: string;
    /** Toggles: the options that are on (instead of one `value`) */
    selected?: readonly string[];
    /** Toggles, collapsed: the button's icon unless exactly one option is on */
    icon?: IconName;
    /** Its options side by side instead of the button and its menu */
    expanded?: boolean;
    /** The buttons shoulder to shoulder (the shading spheres) */
    tight?: boolean;
    stroke?: number;
    /** An option chosen – or, toggles, switched */
    onchoose: (value: string) => void;
  } = $props();

  const toggles = $derived(selected !== undefined);
  const isOn = (option: ToolGroupOption) => (selected ? selected.includes(option.value) : option.value === active.value);
  const active = $derived(activeOption(options, selected ? (selected[0] ?? "") : value));
  /** Toggles: the button's icon and the names of the options on */
  const onNames = $derived(selected ? options.filter(o => selected.includes(o.value)).map(o => o.name) : []);
  const buttonIcon = $derived<IconName>(!selected ? active.icon : selected.length === 1 ? active.icon : (icon ?? active.icon));
  const buttonName = $derived(!selected ? active.name : onNames.length ? onNames.join(", ") : "anything");
  const menuId = `tool-menu-${Math.random().toString(36).slice(2, 9)}`;
  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  let at = $state({ left: 0, top: 0 });
  let items: HTMLButtonElement[] = $state([]);

  const focusItem = (index: number) => items[index]?.focus();

  const show = async () => {
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    at = { left: r.left, top: r.bottom + 2 };
    open = true;
    await tick();
    // Keep the menu on the screen: shifted left at the right edge, above the button when there is no room below
    if (menu) {
      const m = menu.getBoundingClientRect();
      const left = Math.max(4, Math.min(r.left, window.innerWidth - m.width - 4));
      const top = r.bottom + 2 + m.height > window.innerHeight - 4 ? Math.max(4, r.top - 2 - m.height) : r.bottom + 2;
      at = { left, top };
    }
    focusItem(toggles ? 0 : activeIndex(options, value));
  };
  const close = (refocus: boolean) => {
    open = false;
    if (refocus) trigger?.focus();
  };
  const choose = (next: string) => {
    onchoose(next);
    if (!toggles) close(true);
  };
  // A tap anywhere the backdrop does not reach (the top bar) closes it too
  $effect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target && (menu?.contains(target) || trigger?.contains(target) || target.classList.contains("backdrop"))) return;
      close(false);
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  });
  const triggerKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    void show();
  };
  const menuKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close(false);
      return;
    }
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = menuStep(event.key, index < 0 ? activeIndex(options, value) : index, options.length);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation(); // not the spreads' ← →
    focusItem(next);
  };
</script>

<svelte:window onresize={() => { if (open) close(false); }} />

<span class="tool-group" class:tight={tight && expanded} role="group" aria-label={label}>
  {#if expanded}
    {#each options as option (option.value)}
      <button type="button" class="icon-button" class:on={isOn(option)} aria-pressed={isOn(option)}
        title={option.label} aria-label={option.label} onclick={() => onchoose(option.value)}><Icon name={option.icon} {stroke} /></button>
    {/each}
  {:else}
    <button bind:this={trigger} type="button" class="icon-button group-button" class:open aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      title={toggles ? `${label}: ${buttonName} – tap to switch` : `${label}: ${active.label} – tap for the others`} aria-label="{label}: {buttonName}"
      onclick={() => (open ? close(false) : void show())} onkeydown={triggerKey}>
      <Icon name={buttonIcon} {stroke} />
    </button>
    {#if open}
      <button type="button" class="backdrop" tabindex="-1" aria-label="Close the menu" onclick={() => close(false)}></button>
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div bind:this={menu} id={menuId} class="flyout" role="menu" aria-label={label} tabindex="-1" style:left="{at.left}px" style:top="{at.top}px" onkeydown={menuKey}>
        {#each options as option, i (option.value)}
          <button bind:this={items[i]} type="button" class="item" class:on={isOn(option)} role={toggles ? "menuitemcheckbox" : "menuitemradio"} aria-checked={isOn(option)}
            tabindex={(toggles ? i === 0 : option.value === active.value) ? 0 : -1} title={option.label} aria-label={option.label} onclick={() => choose(option.value)}>
            <Icon name={option.icon} {stroke} /><span class="name">{option.name}</span>{#if option.key}<kbd class="small muted">{option.key}</kbd>{/if}{#if toggles}<span class="check" class:shown={isOn(option)}><Icon name="check" size=".875rem" /></span>{/if}
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</span>

<style>
  .tool-group { flex: none; display: inline-flex; align-items: center; gap: .125rem; }
  .tool-group.tight { gap: 0; }
  .group-button { position: relative; }
  .group-button::after { content: ""; position: absolute; right: 2px; bottom: 2px; border: 2.5px solid transparent; border-right-color: var(--muted); border-bottom-color: var(--muted); }
  .group-button.open { background: var(--pressed-background); color: var(--pressed-color); }
  .backdrop { position: fixed; inset: 0; z-index: 9; border: none; background: none; padding: 0; cursor: default; }
  .flyout { position: fixed; z-index: 10; display: flex; flex-direction: column; min-width: 9rem; padding: .25rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); outline: none; }
  .item { display: flex; align-items: center; gap: .5rem; height: var(--control-height); padding: 0 .625rem; border: none; border-radius: var(--control-radius); background: none; color: inherit; text-align: left; cursor: pointer; white-space: nowrap; }
  .item.on { background: var(--pressed-background); color: var(--pressed-color); }
  .name { flex: 1; }
  .check { display: inline-flex; visibility: hidden; }
  .check.shown { visibility: visible; }
  kbd { font-family: inherit; }
  @media (hover: hover) {
    .item:hover { background: var(--hover-background); }
    .item.on:hover { background: var(--pressed-background); }
  }
</style>
