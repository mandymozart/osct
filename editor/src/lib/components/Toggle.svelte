<script lang="ts">
  /**
   * An on/off switch: a pill that reads *on* or *off* and shows pressed while on (`aria-pressed`) – the editor's boolean,
   * never a native checkbox or an on/off `Segmented` (RULES #32, #241). In a row for a boolean value, and in the head of a
   * section that can be switched as a whole (`Section` with `enabled`, #233). `label` names what it switches for assistive
   * technology and the Info view; `help` is its Info-view text. `words` replaces *off* / *on* where the value has other
   * words (a variable's `false` / `true`).
   */
  let { on, label, title, help, words = ["off", "on"], disabled = false, onchange }: {
    on: boolean;
    label: string;
    title?: string;
    help?: string;
    words?: readonly [off: string, on: string];
    disabled?: boolean;
    onchange: (on: boolean) => void;
  } = $props();
</script>

<button type="button" class="pill framed toggle" class:on aria-pressed={on} aria-label={label} data-help-name={label} data-help={help}
  {title} {disabled} onclick={() => onchange(!on)}>{on ? words[1] : words[0]}</button>

<style>
  .toggle { min-width: 2.75rem; justify-content: center; }
</style>
