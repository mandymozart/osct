<script lang="ts">
  /**
   * The Logic view's zoom controls (Tilman, 2026-11-21): one row of three icon buttons in a square-cornered frame –
   * zoom in, zoom out, show everything – in place of xyflow's own vertical stack. Inside the flow (it reads its view).
   */
  import { Panel, useSvelteFlow } from "@xyflow/svelte";
  import Icon from "#lib/components/Icon.svelte";

  const flow = useSvelteFlow();
  const DURATION = 150;
</script>

<Panel position="bottom-right">
  <div class="view-controls" role="group" aria-label="View">
    <button type="button" title="Zoom in" aria-label="Zoom in" onclick={() => flow.zoomIn({ duration: DURATION })}><Icon name="zoomIn" /></button>
    <button type="button" title="Zoom out" aria-label="Zoom out" onclick={() => flow.zoomOut({ duration: DURATION })}><Icon name="zoomOut" /></button>
    <button type="button" title="Show everything" aria-label="Show everything" onclick={() => flow.fitView({ duration: DURATION })}><Icon name="fit" /></button>
  </div>
</Panel>

<style>
  .view-controls { display: flex; background: var(--control-background); border: 1px solid var(--line); border-radius: 0; }
  button { all: unset; box-sizing: border-box; display: grid; place-items: center; width: 1.9rem; height: 1.9rem; cursor: pointer; color: var(--text); font-size: 1rem; }
  @media (hover: hover) { button:hover { background: var(--hover-background); } }
  button:focus-visible { outline: 1px solid var(--text); outline-offset: -2px; }
</style>
