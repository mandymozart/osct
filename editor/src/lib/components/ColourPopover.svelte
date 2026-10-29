<script lang="ts">
  import { untrack } from "svelte";
  import { HEX, PALETTE, hexToHsv, hsvToHex, longHex, recentColours, type Hsv } from "$lib/colour";
  import Icon from "./Icon.svelte";

  /**
   * The colour popover's content (after Scutoons' colour popover, owner 2026-10-18: "the native picker isn't app
   * UI"): the palette, this browser's recent colours, a saturation / brightness area with a hue slider, the hex, and
   * the eyedropper that picks from the stage. Every pick goes out at once (`onpick`, a whole `#rrggbb`); the field
   * stays the source of the value. Keyboard: Tab through the swatches → the area (arrows: saturation ← →,
   * brightness ↑ ↓; Shift ×10) → the hue (a range input) → the hex.
   */
  let { value, palette = PALETTE, onpick, oneyedropper }: {
    /** The field's colour (a whole hex) */
    value: string;
    palette?: { name: string; hex: string }[];
    onpick: (hex: string) => void;
    /** Pick from the stage (the colour under the pointer); none = no button */
    oneyedropper?: () => void;
  } = $props();

  const swatches = $derived(palette.filter(c => HEX.test(c.hex)).map(c => ({ ...c, hex: longHex(c.hex) })));
  const recent = recentColours();
  const current = $derived(HEX.test(value) ? longHex(value) : null);

  /** The picker's own state (keeps the hue while saturation or brightness is 0) */
  let hsv = $state<Hsv>(untrack(() => hexToHsv(HEX.test(value) ? value : "#000000")));
  // A colour set from outside (a swatch, the hex, the field) moves the picker – not the echo of its own pick
  let last = "";
  $effect(() => {
    if (current && current !== last) hsv = hexToHsv(current);
  });

  const pick = (hex: string) => {
    last = longHex(hex);
    onpick(last);
  };
  /** A whole colour chosen (a swatch, the hex): the picker moves there too */
  const choose = (hex: string) => {
    hsv = hexToHsv(hex);
    pick(hex);
  };
  const set = (next: Partial<Hsv>) => {
    hsv = { ...hsv, ...next };
    pick(hsvToHex(hsv));
  };

  // ── the saturation / brightness area ──
  let area = $state<HTMLDivElement>();
  let dragging = false;
  const fromPointer = (e: PointerEvent) => {
    const r = area!.getBoundingClientRect();
    set({ s: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), v: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)) });
  };
  const areaDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    area?.focus();
    try { area?.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    dragging = true;
    fromPointer(e);
  };
  const areaKey = (e: KeyboardEvent) => {
    const d = e.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: Math.max(0, hsv.s - d) },
      ArrowRight: { s: Math.min(1, hsv.s + d) },
      ArrowDown: { v: Math.max(0, hsv.v - d) },
      ArrowUp: { v: Math.min(1, hsv.v + d) },
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    set(moves[e.key]);
  };

  /** The hex field: only a whole colour goes out while typing */
  const typeHex = (raw: string) => {
    const v = raw.trim();
    const hex = v.startsWith("#") ? v : `#${v}`;
    if (HEX.test(hex)) choose(hex);
  };
</script>

{#snippet row(list: { name: string; hex: string }[], heading: string)}
  <div class="section" role="group" aria-label={heading}>
    <span class="section-label">{heading}</span>
    <div class="swatches">
      {#each list as c (c.name + c.hex)}
        <button type="button" class="swatch" style:--c={c.hex} aria-label={c.name ? `${c.name} ${c.hex}` : c.hex} title={c.name ? `${c.name} ${c.hex}` : c.hex}
          aria-pressed={current === c.hex} onclick={() => choose(c.hex)}></button>
      {/each}
    </div>
  </div>
{/snippet}

<div class="colour-popover">
  {@render row(swatches, "palette")}
  {#if recent.length}{@render row(recent.map(hex => ({ name: "", hex })), "recent")}{/if}

  <div bind:this={area} class="area" role="slider" tabindex="0" aria-label="Saturation and brightness"
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv.s * 100)} aria-valuetext="{Math.round(hsv.s * 100)} % · {Math.round(hsv.v * 100)} %"
    style:--hue={hsv.h} onpointerdown={areaDown} onpointermove={e => dragging && fromPointer(e)} onpointerup={() => (dragging = false)}
    onpointercancel={() => (dragging = false)} onkeydown={areaKey}>
    <span class="dot" style:left="{hsv.s * 100}%" style:top="{(1 - hsv.v) * 100}%"></span>
  </div>
  <input class="hue" type="range" min="0" max="359" step="1" aria-label="Hue" value={Math.round(hsv.h)} oninput={e => set({ h: Number(e.currentTarget.value) })} />
  <div class="hex-row">
    {#if oneyedropper}
      <button type="button" class="icon-button framed" aria-label="Pick from the stage" title="Pick the colour under the pointer on the stage (Esc cancels)" onclick={oneyedropper}><Icon name="droplet" stroke={2} /></button>
    {/if}
    <input class="field hex" type="text" spellcheck="false" autocomplete="off" aria-label="Hex" value={current ?? ""} oninput={e => typeHex(e.currentTarget.value)} />
  </div>
</div>

<style>
  .colour-popover { display: flex; flex-direction: column; gap: .5rem; width: 15rem; padding: .5rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); }
  .section { display: flex; flex-direction: column; gap: .25rem; }
  .section .section-label { font-size: var(--text-small); }
  .swatches { display: flex; flex-wrap: wrap; gap: .25rem; }
  /* a swatch: a control-height square, a line frame, the colour inside; the current one framed in the text colour */
  .swatch { width: var(--control-height); height: var(--control-height); margin: 0; padding: 2px; border: 1px solid var(--line); border-radius: var(--control-radius);
    background: linear-gradient(var(--c), var(--c)) content-box, var(--surface); cursor: pointer; }
  .swatch[aria-pressed="true"] { border-color: var(--text); border-width: 2px; padding: 1px; }
  .area { position: relative; height: 7rem; border: 1px solid var(--line); border-radius: var(--control-radius);
    background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(var(--hue) 100% 50%)); cursor: crosshair; touch-action: none; }
  .area:focus-visible { outline: 1px solid var(--text); }
  .dot { position: absolute; width: .75rem; height: .75rem; transform: translate(-50%, -50%); border: 2px solid #fff; border-radius: 50%; outline: 1px solid #000; pointer-events: none; }
  .hue { appearance: none; width: 100%; height: .875rem; margin: 0; border: 1px solid var(--line); border-radius: var(--control-radius);
    background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); cursor: pointer; }
  .hue::-webkit-slider-thumb { appearance: none; width: .5rem; height: 1.125rem; border: 1px solid var(--text); border-radius: 2px; background: var(--surface); }
  .hue::-moz-range-thumb { box-sizing: border-box; width: .5rem; height: 1.125rem; border: 1px solid var(--text); border-radius: 2px; background: var(--surface); }
  .hex-row { display: flex; gap: .25rem; }
  .hex { flex: 1; min-width: 0; width: 100%; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
</style>
