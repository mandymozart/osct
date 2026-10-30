<script lang="ts">
  import Icon from "./Icon.svelte";
  import { parseNumber } from "#lib/values.js";

  /**
   * A number control where the whole field is the gesture (the Scutoons dogma's ScrubNumber): a tap focuses it for
   * typing (the value selected), press and slide scrubs by `step` per few pixels (Shift ×10, Alt ×0.1), ↑ ↓ step,
   * Enter commits, Escape reverts. The unit follows the number; a reset arrow shows while the value differs from
   * `fallback` and sets it back. No native slider: the panels' controls stay one height.
   * `oninput` fires with every valid change (scrubbing, typing), `onchange` when a value is committed.
   */
  interface Props {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    /** The reset value (the content's default) */
    fallback?: number;
    unit?: string;
    /** A tag before the number: X / Y / Z */
    prefix?: string;
    label: string;
    /** A value outside min … max is refused */
    strict?: boolean;
    /** Must be > 0 (scale) */
    positive?: boolean;
    disabled?: boolean;
    oninput?: (value: number) => void;
    onchange?: (value: number) => void;
  }
  let { value, min, max, step = 1, fallback, unit = "", prefix = "", label, strict = false, positive = false, disabled = false, oninput, onchange }: Props = $props();

  const SCRUB_START_PX = 4;
  const PX_PER_STEP = 2;

  let input = $state<HTMLInputElement>();
  let typing = $state(false);
  let scrubbing = $state(false);
  let problem = $state("");
  let text = $state("");
  let typingStart = 0;
  let press: { pointerId: number; x: number; y: number; start: number; scrubbing: boolean } | null = null;

  const decimals = $derived(String(step).split(".")[1]?.length ?? 0);
  const shown = $derived((+value.toFixed(Math.max(decimals, 0))).toString());
  const canReset = $derived(fallback !== undefined && Math.abs(fallback - value) > 1e-9);

  $effect(() => {
    if (!typing) {
      text = shown;
      problem = "";
    }
  });

  const problemOf = (v: number): string | null => {
    if (strict && ((min !== undefined && v < min) || (max !== undefined && v > max))) return `${min ?? "…"} … ${max ?? "…"}`;
    if (positive && v <= 0) return "must be > 0";
    return null;
  };
  const clamp = (v: number): number => {
    if (strict) {
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
    }
    if (positive && v <= 0) v = step;
    return +v.toFixed(6);
  };
  const apply = (v: number, final: boolean) => {
    value = v;
    oninput?.(v);
    if (final) onchange?.(v);
  };
  const commit = (v: number) => apply(clamp(v), true);

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || disabled) return;
    press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: value, scrubbing: false };
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!press || press.pointerId !== event.pointerId) return;
    // The quadrant rule (dogma, Tilman 2026-10-29): sliding up or right raises the value, down or left lowers it –
    // the two directions add up, so a diagonal towards the top right is the fastest way up
    const dx = event.clientX - press.x;
    const dy = press.y - event.clientY;
    const distance = dx + dy;
    if (!press.scrubbing) {
      if (Math.hypot(dx, dy) < SCRUB_START_PX) return;
      press.scrubbing = true;
      typing = false;
      input?.blur();
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      scrubbing = true;
      event.preventDefault();
    }
    const factor = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    const steps = Math.round(distance / PX_PER_STEP);
    apply(clamp(press.start + steps * step * factor), false);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!press || press.pointerId !== event.pointerId) return;
    const wasScrubbing = press.scrubbing;
    press = null;
    scrubbing = false;
    if (wasScrubbing) {
      onchange?.(value);
      return;
    }
    typing = true;
    typingStart = value;
    text = shown;
    requestAnimationFrame(() => {
      input?.focus();
      input?.select();
    });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const factor = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
      commit(value + (event.key === "ArrowUp" ? 1 : -1) * step * factor);
      text = shown;
      input?.select();
    } else if (event.key === "Enter") {
      event.preventDefault();
      commitTyped();
      input?.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      revertTyped();
      input?.blur();
    }
  };
  /** While typing: a valid number is applied live (no change yet) */
  const onTyped = () => {
    const v = parseNumber(text);
    if (v === null) {
      problem = text.trim() ? "not a number" : "";
      return;
    }
    problem = problemOf(v) ?? "";
    if (problem) return;
    value = v;
    oninput?.(v);
  };
  const commitTyped = () => {
    if (!typing) return;
    const v = parseNumber(text);
    if (v === null || problemOf(v)) return revertTyped();
    typing = false;
    commit(v);
  };
  const revertTyped = () => {
    typing = false;
    const changed = value !== typingStart;
    value = typingStart;
    problem = "";
    if (changed) oninput?.(value);
  };
</script>

<span class="scrub" class:disabled>
  <span class="frame" role="group" aria-label={label} class:scrubbing class:typing onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerUp}>
    {#if prefix}<span class="prefix">{prefix}</span>{/if}
    <input bind:this={input} type="text" inputmode="decimal" enterkeyhint="done" spellcheck="false" autocomplete="off"
      aria-label={label} bind:value={text} oninput={onTyped} onkeydown={onKey} onblur={commitTyped} {disabled} />
    <span class="unit">{unit}</span>
    {#if canReset}
      <button type="button" class="reset" title="Reset" aria-label="Reset {label}" onpointerdown={e => e.stopPropagation()} onclick={() => commit(fallback ?? 0)}>
        <Icon name="reset" size="1em" />
      </button>
    {/if}
  </span>
  {#if problem}<span class="problem">{problem}</span>{/if}
</span>

<style>
  .scrub { display: inline-flex; flex-direction: column; min-width: 0; }
  .frame { position: relative; display: flex; align-items: center; height: var(--control-height); min-width: 0;
    border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--control-background);
    touch-action: none; cursor: all-scroll; user-select: none; }
  .frame.scrubbing { border-color: var(--text); }
  .frame.typing { cursor: text; }
  input { flex: 1; min-width: 0; width: 100%; height: 100%; padding: 0 .125rem 0 .6rem; border: none; background: none; font: inherit;
    color: var(--text); text-align: right; outline: none; cursor: inherit; font-variant-numeric: tabular-nums; }
  input::selection { background: var(--text); color: var(--surface); }
  .unit { flex: none; padding-right: .5rem; color: var(--muted); font-size: var(--text-small); }
  .unit:empty { padding-right: .4rem; }
  .prefix { flex: none; padding-left: .5rem; color: var(--muted); font-size: var(--text-small); letter-spacing: .08em; }
  .prefix + input { padding-left: .25rem; }
  /* Narrow, with the unit moved up to it: an axis field (X / Y / Z side by side) still shows three digits (#170) */
  .unit:has(+ .reset) { padding-right: .125rem; }
  .reset { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 1.25rem; height: 100%;
    border: none; background: none; color: var(--muted); cursor: pointer; font: inherit; padding: 0; }
  .reset:focus-visible { color: var(--text); outline: none; }
  @media (hover: hover) {
    .reset:hover { color: var(--text); }
  }
  .problem { color: var(--danger); font-size: var(--text-small); line-height: 1rem; padding: 0 .6rem; }
  .disabled { cursor: not-allowed; }
  .disabled .frame { opacity: .45; pointer-events: none; }
</style>
