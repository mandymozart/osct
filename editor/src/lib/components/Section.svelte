<script lang="ts">
  import type { Snippet } from "svelte";
  import { sections } from "#lib/sections.svelte.js";
  import Icon from "./Icon.svelte";
  import Toggle from "./Toggle.svelte";

  /**
   * A collapsible section of a panel: a header (chevron, label, optional `aside` at the right) that opens and closes
   * its rows. The open state is kept per `id` (`sections`); `open` is the first-visit default until the author toggles
   * it. While closed, `summary` follows the label ("post-processing · the whole book"), so closed hides nothing that
   * matters. `help` is the section's description for the Info view. `data-section` carries the id, so a link from
   * elsewhere can scroll the section into view.
   * A group of settings that is switched as a whole (#233, agents/DESIGN.md "Sections and toggles") passes `enabled`
   * and `onenabled`: its head carries an on/off `Toggle` that works without opening the section, and the label dims
   * while it is off. `nested` is a section inside another one (a pass in the post-processing): its label reads as a
   * name, not as a heading.
   */
  interface Props {
    id: string;
    label: string;
    open?: boolean;
    summary?: string;
    help?: string;
    /** On or off – with `onenabled`, the head shows the toggle */
    enabled?: boolean;
    onenabled?: (enabled: boolean) => void;
    /** What the toggle switches, in words ("bloom on or off") */
    enabledLabel?: string;
    nested?: boolean;
    aside?: Snippet;
    children: Snippet;
  }
  let { id, label, open = true, summary, help, enabled, onenabled, enabledLabel, nested = false, aside, children }: Props = $props();

  const isOpen = $derived(sections.isOpen(id, open));
  const head = $derived(!isOpen && summary ? `${label} · ${summary}` : label);
  const switchable = $derived(enabled !== undefined && !!onenabled);
</script>

<div class="section" class:closed={!isOpen} class:nested class:off={switchable && !enabled} data-section={id}>
  <button type="button" class="head" aria-expanded={isOpen} data-help={help} data-help-name={label} onclick={() => sections.toggle(id, open)}>
    <Icon name={isOpen ? "down" : "next"} size=".875rem" />
    <span class="section-label">{head}</span>
  </button>
  {#if switchable || aside}
    <span class="aside">
      {#if switchable}<Toggle on={!!enabled} label={enabledLabel ?? `${label} on or off`} title={enabled ? `Switch ${label} off – its values stay` : `Switch ${label} on`} onchange={on => onenabled?.(on)} />{/if}
      {#if aside}{@render aside()}{/if}
    </span>
  {/if}
</div>
{#if isOpen}{@render children()}{/if}

<style>
  .section { justify-content: flex-start; }
  .section.nested { flex-wrap: nowrap; margin-top: 0; border-top-style: dotted; }
  .nested .section-label { color: var(--text); font-size: inherit; letter-spacing: normal; text-transform: none; }
  .off .section-label { color: var(--muted); }
  .head { display: inline-flex; align-items: center; gap: .25rem; flex: 1; min-width: 0; height: var(--control-height); margin-left: -.25rem; padding: 0 .25rem;
    border: none; border-radius: var(--control-radius); background: none; color: var(--muted); cursor: pointer; text-align: left; }
  .head > :global(svg) { flex: none; }
  .head .section-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (hover: hover) {
    .head:hover { color: var(--text); }
    .head:hover .section-label { color: var(--text); }
  }
  .aside { display: inline-flex; align-items: center; gap: .375rem; flex: none; }
</style>
