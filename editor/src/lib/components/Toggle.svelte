<script lang="ts">
  /**
   * An on/off switch: a pill that reads *on* or *off* and shows pressed while on (`aria-pressed`) – the editor's boolean,
   * never a native checkbox (RULES #32). In a row for a boolean value, and in the head of a section that can be switched
   * as a whole (`Section` with `enabled`, #233). `label` names what it switches for assistive technology and the Info view.
   */
  let { on, label, title, onchange }: { on: boolean; label: string; title?: string; onchange: (on: boolean) => void } = $props();
</script>

<button type="button" class="pill framed toggle" class:on aria-pressed={on} aria-label={label} data-help-name={label}
  {title} onclick={() => onchange(!on)}>{on ? "on" : "off"}</button>

<style>
  .toggle { min-width: 2.75rem; justify-content: center; }
</style>
