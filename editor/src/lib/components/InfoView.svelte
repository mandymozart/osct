<script lang="ts">
  import { onMount } from "svelte";
  import { help } from "$lib/help.svelte";
  import Icon from "./Icon.svelte";

  /**
   * The **Info view** (like Ableton's): the name and description of the control under the pointer or in focus
   * (`help`). Collapsible to its header; the open state is stored. One per page – it follows the whole document.
   */
  onMount(() => help.listen(document));
</script>

<section class="info" class:closed={!help.open} aria-label="Info" data-app-ui>
  <button type="button" class="head" aria-expanded={help.open} onclick={() => help.setOpen(!help.open)}
    data-help="The name and description of the control under the pointer or in focus. Click to show or hide it.">
    <Icon name={help.open ? "down" : "up"} size=".875rem" />
    <span class="section-label">info</span>
  </button>
  {#if help.open}
    <div class="body" aria-live="polite">
      {#if help.current}
        {#if help.current.name}<strong class="name">{help.current.name}</strong>{/if}
        <p class="text">{help.current.text}</p>
      {:else}
        <p class="text muted">Point at a control to see what it does.</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .info { flex: none; display: flex; flex-direction: column; border-top: 1px solid var(--line); background: var(--surface); }
  .head { display: flex; align-items: center; gap: .25rem; height: var(--control-height); padding: 0 .5rem; border: none; background: var(--surface-head); color: var(--muted); cursor: pointer; text-align: left; }
  .head:hover, .head:hover .section-label { color: var(--text); }
  .body { height: 9rem; overflow-y: auto; padding: .375rem .625rem .5rem; }
  .name { display: block; margin-bottom: .25rem; font-weight: 600; }
  .text { margin: 0; overflow-wrap: anywhere; }
</style>
