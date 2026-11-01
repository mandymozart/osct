<script lang="ts">
  import { HEX, longHex, rememberColour } from "#lib/colour.js";
  import ColourPopover from "./ColourPopover.svelte";

  /**
   * A colour value: the swatch opens the editor's colour popover (palette, recent colours, area + hue, hex, pick from
   * the stage – not the browser's picker), the hex field beside it takes a typed colour (a whole `#rrggbb` goes out
   * at once; an incomplete one shows what is expected). The popover sits in the top layer (no panel clips it), under
   * the swatch, or above it when the screen ends; Esc or a click outside closes it and the focus returns to the swatch.
   */
  let { value, label, onchange, onpick }: {
    value: string;
    label: string;
    onchange: (hex: string) => void;
    /** Pick the colour under the pointer on the stage; none = no eyedropper */
    onpick?: () => Promise<string | null>;
  } = $props();

  const current = $derived(HEX.test(value) ? longHex(value) : value);
  let text = $state("");
  let problem = $state("");
  let editing = $state(false);
  // The field shows the value unless it is being typed into
  $effect(() => { if (!editing) text = current; });

  const typed = (raw: string) => {
    text = raw;
    const v = raw.trim();
    const hex = v.startsWith("#") ? v : `#${v}`;
    if (HEX.test(hex)) {
      problem = "";
      onchange(longHex(hex));
    }
  };
  const commit = () => {
    editing = false;
    const v = text.trim();
    const hex = v.startsWith("#") ? v : `#${v}`;
    if (HEX.test(hex)) { problem = ""; onchange(longHex(hex)); }
    else problem = "a colour like #ff8800";
  };

  let button = $state<HTMLButtonElement>();
  let pop = $state<HTMLDivElement>();
  let left = $state(0);
  let top = $state(0);
  let openedWith = "";

  const place = () => {
    if (!button || !pop) return;
    const r = button.getBoundingClientRect();
    const width = pop.offsetWidth || 240;
    const height = pop.offsetHeight || 320;
    left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    top = r.bottom + 4 + height > window.innerHeight - 8 ? Math.max(8, r.top - 4 - height) : r.bottom + 4;
  };
  const ontoggle = (e: Event) => {
    if ((e as ToggleEvent).newState === "open") {
      openedWith = current;
      place();
      setTimeout(() => { place(); pop?.querySelector<HTMLElement>("button, [tabindex]")?.focus(); });
      return;
    }
    if (HEX.test(current) && current !== openedWith) rememberColour(current);
    if (!document.activeElement || document.activeElement === document.body || pop?.contains(document.activeElement)) button?.focus();
  };

  const pickFromStage = async () => {
    if (!onpick) return;
    pop?.hidePopover();
    const hex = await onpick();
    if (hex && HEX.test(hex)) {
      onchange(longHex(hex));
      rememberColour(hex);
    }
    button?.focus();
  };
</script>

<span class="colour">
  <button bind:this={button} type="button" class="swatch" style:--c={HEX.test(current) ? current : "transparent"} aria-label="{label}: choose a colour" title="Choose a colour"
    onclick={() => pop?.togglePopover()}></button>
  <input class="field hex" value={text} spellcheck="false" autocomplete="off" aria-label={label}
    onfocus={() => (editing = true)} oninput={e => typed(e.currentTarget.value)} onblur={commit}
    onkeydown={e => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } if (e.key === "Escape") { text = current; problem = ""; e.currentTarget.blur(); } }} />
  {#if problem}<span class="small danger">{problem}</span>{/if}
</span>
<div bind:this={pop} class="pop" popover="auto" {ontoggle} style:left="{left}px" style:top="{top}px">
  <ColourPopover value={current} onpick={hex => onchange(hex)} oneyedropper={onpick ? pickFromStage : undefined} />
</div>

<style>
  .colour { display: grid; grid-template-columns: var(--control-height) minmax(0, 1fr); gap: .375rem; align-items: center; }
  .swatch { width: var(--control-height); height: var(--control-height); margin: 0; padding: 2px; border: 1px solid var(--line); border-radius: 50%;
    background: linear-gradient(var(--c), var(--c)) content-box, var(--surface); cursor: pointer; }
  @media (hover: hover) {
    .swatch:hover { border-color: var(--text); }
  }
  .hex { width: 100%; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
  .colour .small { grid-column: 2; }
  .pop { position: fixed; inset: auto; margin: 0; padding: 0; border: none; background: none; color: inherit; overflow: visible; }
  .pop::backdrop { background: transparent; }
</style>
