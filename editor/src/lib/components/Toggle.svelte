<script lang="ts">
  import { isSwitchKey, switchKeyDown } from "./toggle-keys.ts";

  /**
   * An on/off switch: a track with a knob that slides right and turns the track dark while on – a `<button role="switch">`
   * with `aria-checked`, Space and Enter flip it (#243; the reader's `<gold-switch>` is its model). The editor's boolean,
   * never a native checkbox, an on/off `Segmented` or a pill that reads *on* / *off* (RULES #32, #241). In a row for a
   * boolean value, and in the head of a section that can be switched as a whole (`Section` with `enabled`, #233).
   * The row's word is its visible label; `label` names what it switches for assistive technology and the Info view,
   * `help` is its Info-view text. `words` adds a quiet value after the track where the value has words of its own (a
   * variable's `false` / `true`).
   */
  let { on, label, title, help, words, disabled = false, onchange }: {
    on: boolean;
    label: string;
    title?: string;
    help?: string;
    words?: readonly [off: string, on: string];
    disabled?: boolean;
    onchange: (on: boolean) => void;
  } = $props();

  const keydown = (e: KeyboardEvent) => {
    const what = switchKeyDown(e.key, e.repeat);
    if (what === "none") return;
    // The button would click too (Enter on keydown, Space on keyup): one press, one flip
    e.preventDefault();
    if (what === "flip" && !disabled) onchange(!on);
  };
  const keyup = (e: KeyboardEvent) => {
    if (isSwitchKey(e.key)) e.preventDefault();
  };
</script>

<button type="button" class="switch" role="switch" aria-checked={on} aria-label={label} data-help-name={label} data-help={help}
  {title} {disabled} onclick={() => onchange(!on)} onkeydown={keydown} onkeyup={keyup}><span class="track" aria-hidden="true"></span>{#if words}<span
  class="value" aria-hidden="true">{on ? words[1] : words[0]}</span>{/if}</button>

<style>
  /* The button is the hit area – the control height, at least as wide; the track sits at its start (DESIGN.md §9) */
  .switch { display: inline-flex; flex: none; align-items: center; gap: .375rem; height: var(--control-height); min-width: var(--control-height);
    padding: 0; border: none; background: none; color: var(--text); cursor: pointer; }
  .track { position: relative; flex: none; width: 1.875rem; height: 1.125rem; border: 1px solid var(--line); border-radius: 999px;
    background: var(--control-background); transition: background-color .15s, border-color .15s; }
  .track::before { content: ""; position: absolute; top: 50%; left: .125rem; width: .75rem; height: .75rem; border-radius: 50%;
    background: var(--muted); transform: translateY(-50%); transition: transform .15s, background-color .15s; }
  .switch[aria-checked="true"] .track { border-color: var(--text); background: var(--text); }
  .switch[aria-checked="true"] .track::before { background: var(--surface); transform: translate(.875rem, -50%); }
  @media (hover: hover) {
    .switch:hover:not(:disabled) .track { border-color: var(--muted); }
    .switch[aria-checked="true"]:hover:not(:disabled) .track { border-color: var(--text); }
  }
  /* The focus ring around the track, not around the button's empty hit area */
  .switch:focus-visible { outline: none; }
  .switch:focus-visible .track { outline: 2px solid var(--text); outline-offset: 1px; }
  .switch:disabled { opacity: .45; cursor: not-allowed; }
  .value { color: var(--muted); }
  @media (prefers-reduced-motion: reduce) {
    .track, .track::before { transition: none; }
  }
</style>
