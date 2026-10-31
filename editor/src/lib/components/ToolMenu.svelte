<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import Icon, { type IconName } from "./Icon.svelte";
  import { closesOnResize, menuStep, openFocus } from "#lib/tool-groups.js";

  /**
   * A stage toolbar group that is one button opening a small panel of settings attached to it (#190's *grid & snap*,
   * #229's *view*): the button shows the group's icon (a small corner mark says it opens more; `marked` adds a dot in
   * its other corner – snapping on), the panel holds the group's rows – the panels' controls (Segmented, pressed pills,
   * ScrubNumber, a select), with the touch height on a finger. A tap opens it with the panel focused (no field, so a
   * phone shows no keyboard), ↓ / ↑ on the button on its first control; ↑ ↓
   * (Home / End) move between its buttons, a number field or a select keeps its own keys, Esc closes and returns the
   * focus to the button, Tab out of it or a tap outside closes it (the backdrop takes the tap, so it picks nothing on
   * the stage). Fixed to the screen, kept on it. `open()` opens it from elsewhere (the stage's menu).
   */
  let { label, title, buttonLabel, icon, marked = false, children }: {
    /** The group's name: the group's and the panel's label */
    label: string;
    /** The button's tooltip (its help in the Info view): what the group holds now */
    title: string;
    /** The button's label: the group's name and its state in a few words */
    buttonLabel: string;
    icon: IconName;
    /** The dot in the button's corner (a state worth seeing with the panel closed) */
    marked?: boolean;
    children: Snippet;
  } = $props();

  const menuId = `tool-menu-${Math.random().toString(36).slice(2, 9)}`;
  let shown = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  let at = $state({ left: 0, top: 0 });

  /** The panel's buttons and fields, in order (the arrows move between its buttons) */
  const focusables = (): HTMLElement[] => (menu ? [...menu.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)")] : []);

  let widthAtOpen = 0;
  /** Open the panel at the button – its first control focused when the keyboard opened it, else the panel itself */
  export const open = async (byKeyboard = false): Promise<void> => {
    if (!trigger) return;
    widthAtOpen = window.innerWidth;
    const r = trigger.getBoundingClientRect();
    at = { left: r.left, top: r.bottom + 2 };
    shown = true;
    await tick();
    if (menu) {
      const m = menu.getBoundingClientRect();
      const left = Math.max(4, Math.min(r.left, window.innerWidth - m.width - 4));
      const top = r.bottom + 2 + m.height > window.innerHeight - 4 ? Math.max(4, r.top - 2 - m.height) : r.bottom + 2;
      at = { left, top };
    }
    if (openFocus(byKeyboard) === "first") focusables()[0]?.focus();
    else menu?.focus({ preventScroll: true });
  };
  const close = (refocus: boolean) => {
    shown = false;
    if (refocus) trigger?.focus();
  };
  // A tap anywhere the backdrop does not reach (the top bar) closes it too
  $effect(() => {
    if (!shown) return;
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
    void open(true);
  };
  const menuKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    // A number field keeps its own keys (↑ ↓ step it, ← → move the caret), a select its choice
    const tag = (event.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT") {
      event.stopPropagation(); // not the spreads' ← →
      return;
    }
    const all = focusables().filter(el => el.tagName === "BUTTON");
    const index = all.indexOf(document.activeElement as HTMLElement);
    const key = event.key === "ArrowLeft" || event.key === "ArrowRight" ? null : event.key;
    // the panel itself focused (opened by a tap): the first arrow goes to the first button
    const next = key ? (index < 0 && all.length ? 0 : menuStep(key, index, all.length)) : null;
    event.stopPropagation(); // not the spreads' ← →
    if (next === null) return;
    event.preventDefault();
    all[next]?.focus();
  };
  /** Tab out of the panel closes it */
  const menuFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && !menu?.contains(next) && next !== trigger) close(false);
  };
</script>

<svelte:window onresize={() => { if (shown && closesOnResize(widthAtOpen, window.innerWidth)) close(false); }} />

<span class="tool-group" role="group" aria-label={label}>
  <button bind:this={trigger} type="button" class="icon-button group-button" class:open={shown} class:marked aria-haspopup="dialog" aria-expanded={shown}
    aria-controls={shown ? menuId : undefined} {title} aria-label={buttonLabel} onclick={() => (shown ? close(false) : void open())} onkeydown={triggerKey}>
    <Icon name={icon} stroke={2} />
  </button>
  {#if shown}
    <button type="button" class="backdrop" tabindex="-1" aria-label="Close the menu" onclick={() => close(false)}></button>
    <div bind:this={menu} id={menuId} class="flyout" role="dialog" aria-label={label} tabindex="-1" style:left="{at.left}px" style:top="{at.top}px"
      onkeydown={menuKey} onfocusout={menuFocusOut}>
      {@render children()}
    </div>
  {/if}
</span>

<style>
  .tool-group { flex: none; display: inline-flex; align-items: center; }
  .group-button { position: relative; }
  .group-button::after { content: ""; position: absolute; right: 2px; bottom: 2px; border: 2.5px solid transparent; border-right-color: var(--muted); border-bottom-color: var(--muted); }
  .group-button.marked::before { content: ""; position: absolute; right: 3px; top: 3px; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .group-button.open { background: var(--pressed-background); color: var(--pressed-color); }
  .backdrop { position: fixed; inset: 0; z-index: 9; border: none; background: none; padding: 0; cursor: default; }
  .flyout { position: fixed; z-index: 10; display: flex; flex-direction: column; width: max-content; max-width: calc(100vw - .5rem); padding: .25rem .5rem; border: 1px solid var(--line);
    border-radius: var(--control-radius); background: var(--surface); color: var(--text); outline: none; }
  .flyout :global(.row) { grid-template-columns: 6rem minmax(0, 1fr); }
  .flyout :global(.rule) { margin-top: .25rem; padding-top: .25rem; border-top: 1px solid var(--line); }
</style>
