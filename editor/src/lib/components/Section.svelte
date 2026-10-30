<script lang="ts">
  import type { Snippet } from "svelte";
  import { sections } from "#lib/sections.svelte.js";
  import Icon from "./Icon.svelte";

  /**
   * A collapsible section of a panel: a header (chevron, label, optional `aside` at the right) that opens and closes
   * its rows. The open state is kept per `id` (`sections`); `open` is the first-visit default until the author toggles
   * it. While closed, `summary` follows the label ("stage · Eiermann · grid off"), so closed hides nothing that matters.
   * `help` is the section's description for the Info view.
   */
  interface Props {
    id: string;
    label: string;
    open?: boolean;
    summary?: string;
    help?: string;
    aside?: Snippet;
    children: Snippet;
  }
  let { id, label, open = true, summary, help, aside, children }: Props = $props();

  const isOpen = $derived(sections.isOpen(id, open));
  const head = $derived(!isOpen && summary ? `${label} · ${summary}` : label);
</script>

<div class="section" class:closed={!isOpen}>
  <button type="button" class="head" aria-expanded={isOpen} data-help={help} data-help-name={label} onclick={() => sections.toggle(id, open)}>
    <Icon name={isOpen ? "down" : "next"} size=".875rem" />
    <span class="section-label">{head}</span>
  </button>
  {#if aside}<span class="aside">{@render aside()}</span>{/if}
</div>
{#if isOpen}{@render children()}{/if}

<style>
  .section { justify-content: flex-start; }
  .head { display: inline-flex; align-items: center; gap: .25rem; flex: 1; min-width: 0; height: var(--control-height); margin-left: -.25rem; padding: 0 .25rem;
    border: none; border-radius: var(--control-radius); background: none; color: var(--muted); cursor: pointer; text-align: left; }
  .head > :global(svg) { flex: none; }
  /* A narrow panel: a long head (a summary) ends in an ellipsis instead of wrapping */
  .head .section-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (hover: hover) {
    .head:hover { color: var(--text); }
    .head:hover .section-label { color: var(--text); }
  }
  .aside { display: inline-flex; align-items: center; gap: .375rem; }
</style>
