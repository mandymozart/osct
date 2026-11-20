<script lang="ts" module>
  import type { FlowBox } from "#lib/logic/flow.js";

  /** What the canvas hands each box (`LogicCanvas.svelte`) */
  export interface LogicBoxData extends Record<string, unknown> {
    box: FlowBox;
    selected: boolean;
    /** The search's hit: drawn heavier until the level changes */
    flash: boolean;
    dim: boolean;
    never: boolean;
    onpick: (box: FlowBox) => void;
    onenter: (box: FlowBox) => void;
  }
</script>

<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import Icon from "#lib/components/Icon.svelte";
  import { handleId } from "#lib/logic/flow.js";

  /**
   * One box of the Logic canvas (#334 L-T3), an `@xyflow/svelte` custom node: a level's node (its label and detail, its
   * ports as handles – inlets left, outlets right, their shape by signal) or a stub at the level's border. A click picks
   * (the canvas's `onnodeclick`); a double-click, Enter or the arrow button enters the box's level – a stub follows to its far
   * end. Read-only: the handles take no connection (L-T4).
   */
  let { data }: { data: LogicBoxData } = $props();

  const box = $derived(data.box);
  const node = $derived(box.node);
  const enterable = $derived(!!node?.enter || !!box.stub);
  const ins = $derived(box.ports.filter(p => p.dir === "in"));
  const outs = $derived(box.ports.filter(p => p.dir === "out"));
  const top = (i: number, n: number) => `top: ${((i + 1) / (n + 1)) * 100}%`;
  const KIND_WORD: Record<string, string> = {
    event: "Event", rule: "Rule", variable: "Variable", node: "Node", plugin: "Plugin", scene: "Scene", group: "Group", entity: "Entity", far: "Elsewhere",
  };
  const label = $derived(box.stub ? box.stub.label : node!.label);
  const detail = $derived(box.stub ? (data.never ? "never fires: another scene" : "elsewhere") : node!.detail);
  const word = $derived(box.stub ? "Stub" : KIND_WORD[node!.kind] ?? node!.kind);

  const keydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && enterable) {
      e.preventDefault();
      data.onenter(box);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      data.onpick(box);
    }
  };
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="box {box.stub ? 'stub' : node!.kind}" class:selected={data.selected} class:flash={data.flash} class:dim={data.dim} class:problem={!!node?.problem}
  class:never={data.never} class:far={!!node?.far} class:in={box.stub?.side === "in"} class:out={box.stub?.side === "out"}
  role="button" tabindex="0" aria-label="{word} {label} – {detail}{node?.problem ? ` – ${node.problem}` : ''}{enterable ? ' – Enter opens it' : ''}"
  title="{word}: {label} – {detail}{node?.problem ? `\n${node.problem}` : ''}{enterable ? '\nDouble-click to open' : ''}"
  ondblclick={e => { if (enterable) { e.stopPropagation(); data.onenter(box); } }} onkeydown={keydown}>
  {#each ins as p, i (p.id)}
    <Handle type="target" position={Position.Left} id={handleId(p)} class="port sig-{p.signal}" style={top(i, ins.length)} isConnectable={false} />
  {/each}
  <span class="text">
    <span class="label">{label}</span>
    <span class="detail">{detail}</span>
  </span>
  {#if enterable}
    <button type="button" class="enter nodrag" aria-label="Open {label}" title={box.stub ? "Go there" : "Open its level"}
      onclick={e => { e.stopPropagation(); data.onenter(box); }}><Icon name="next" /></button>
  {/if}
  {#each outs as p, i (p.id)}
    <Handle type="source" position={Position.Right} id={handleId(p)} class="port sig-{p.signal}" style={top(i, outs.length)} isConnectable={false} />
  {/each}
</div>

<style>
  .box {
    position: relative; box-sizing: border-box; width: 10.5rem; height: 2.5rem; display: flex; align-items: center; gap: .25rem;
    padding: 0 .375rem 0 .5rem; background: var(--surface); border: 1px solid var(--line); color: var(--text); font-size: .75rem; cursor: pointer;
  }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.2; }
  .label { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { font-size: .625rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* The kinds by shape and line, never by colour (RULES #38) */
  .box.event { border-radius: 999px; padding-left: .75rem; }
  .box.rule { border-color: var(--text); }
  .box.variable { border-style: dashed; border-color: var(--text); }
  .box.node { background: var(--control-background); }
  .box.plugin { border: 3px double var(--text); }
  .box.scene { border-color: var(--text); border-width: 1px 1px 1px 4px; }
  .box.group { border: 1px solid var(--text); box-shadow: .1875rem .1875rem 0 0 var(--line); }
  .box.far, .box.stub { border-style: dotted; background: var(--surface-head); }
  .box.stub.never { opacity: .7; }
  .box.selected { background: var(--selected-background); border-color: var(--text); border-width: 2px; }
  .box.flash { outline: 2px solid var(--text); outline-offset: 2px; }
  .box.problem { border-color: var(--danger); border-width: 2px; }
  .box.dim { opacity: .3; }
  .box:focus-visible { outline: 2px solid var(--text); outline-offset: 1px; }
  @media (hover: hover) {
    .box:hover { background: var(--hover-background); }
  }
  .enter {
    flex: none; display: grid; place-items: center; width: 1.25rem; height: 1.25rem; padding: 0; border: 0; background: none; color: var(--muted); cursor: pointer;
  }
  @media (hover: hover) {
    .enter:hover { color: var(--text); background: var(--hover-background); }
  }
  /* Ports: the signal by shape – event round, value a diamond, node square, scene / address a bar, far hollow */
  .box :global(.port) { width: .4375rem; height: .4375rem; min-width: 0; min-height: 0; background: var(--surface); border: 1px solid var(--text); border-radius: 0; cursor: default; }
  .box :global(.port.sig-event) { border-radius: 50%; }
  .box :global(.port.sig-value.svelte-flow__handle-left) { transform: translate(-50%, -50%) rotate(45deg); }
  .box :global(.port.sig-value.svelte-flow__handle-right) { transform: translate(50%, -50%) rotate(45deg); }
  .box :global(.port.sig-node) { background: var(--text); }
  .box :global(.port.sig-scene), .box :global(.port.sig-address) { width: .1875rem; height: .625rem; background: var(--text); }
  .box :global(.port.sig-far) { border-style: dotted; }
</style>
