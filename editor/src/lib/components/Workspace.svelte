<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import FloatingPanel from "./FloatingPanel.svelte";
  import { openFloats, type Floats } from "./floats.svelte.js";

  /**
   * A **workspace** (#356): the stage is the whole window below the top bar and the panels float over it, never pushing
   * it (`FloatingPanel`). What the stage shows is the page's (`stage`); which panels and tabs there are is the page's
   * `Floats` – a workspace is a preset of panels and tabs, remembered per workspace in this browser.
   *
   * The shell measures its room into `floats.metrics` and `floats.area` (the control height from the CSS, a finger's
   * taller one included), registers `floats` with the top bar's panels menu while mounted, holds text selection and the
   * stage's own pointer use off while a panel or a tab is dragged (`.holding`), and draws every panel of tabs with the
   * page's `tab` content and `extra` buttons. `children` come after those panels (panels of their own, prompts).
   *
   * `alone`: the stage by itself over the whole window – no top bar above it, no panels, nothing measured (the render
   * view, #89).
   */
  let {
    floats,
    stage,
    tab,
    extra,
    children,
    stageElement = $bindable(),
    help,
    alone = false,
    coarse = $bindable(false),
  }: {
    floats: Floats;
    /** What the stage shows, drawn inside it */
    stage?: Snippet;
    /** A tab's content, in whatever panel holds it */
    tab: Snippet<[string]>;
    /** Buttons after a panel's tabs, for the tab shown */
    extra?: Snippet<[string]>;
    children?: Snippet;
    /** The stage's element, for what the page builds into it */
    stageElement?: HTMLDivElement;
    /** The stage's name and description for the Info panel */
    help?: { name: string; text: string };
    alone?: boolean;
    /** A finger is the pointer (read only): every control is the touch height (app.css) */
    coarse?: boolean;
  } = $props();

  const COARSE = "(pointer: coarse)";
  coarse = window.matchMedia(COARSE).matches;

  let workspace = $state<HTMLDivElement>();
  let width = $state(0);
  let height = $state(0);
  // The room and the measures from the page's CSS: the control height (44 px with a finger), no gap (#364)
  $effect(() => {
    const [el, w, h] = [workspace, width, height];
    void coarse;
    if (!el || !w || !h) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const token = getComputedStyle(el).getPropertyValue("--control-height").trim();
    const control = token.endsWith("rem") ? parseFloat(token) * rem : parseFloat(token) || 1.75 * rem;
    // No gap (#364): the panels sit flush against the stage's walls and each other
    const gap = 0;
    floats.metrics = { rem, gap, head: control + (3 * rem) / 8 + 1, button: control, char: rem / 2 };
    floats.area = { x: 0, y: 0, w: Math.max(1, w), h: Math.max(1, h) };
  });
  // The top bar's panels menu lists this workspace's panels
  $effect(() => {
    if (alone) return;
    const own = floats;
    openFloats.current = own;
    return () => {
      if (openFloats.current === own) openFloats.current = null;
    };
  });
  onMount(() => {
    const pointer = window.matchMedia(COARSE);
    const onPointer = (event: MediaQueryListEvent) => (coarse = event.matches);
    pointer.addEventListener("change", onPointer);
    return () => pointer.removeEventListener("change", onPointer);
  });
</script>

{#if alone}
<div class="workspace render"><div class="stage" bind:this={stageElement}>{@render stage?.()}</div></div>
{:else}
<div class="workspace" class:holding={!!floats.held || !!floats.tabHeld} bind:this={workspace} bind:clientWidth={width} bind:clientHeight={height}>
  <div class="stage" bind:this={stageElement} data-help-name={help?.name} data-help={help?.text}>{@render stage?.()}</div>

  <!-- The panels float over the stage, in the order of growth (#308) -->
  {#each floats.tabPanels as id (id)}
    <FloatingPanel {floats} {id} {tab} {extra} />
  {/each}
  {@render children?.()}
</div>
{/if}

<style>
  .workspace { position: fixed; inset: var(--top-height) 0 0; background: var(--stage-background); }
  .workspace.render { inset: 0; }
  .workspace.holding { user-select: none; }
  .stage { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: hidden; }
</style>
