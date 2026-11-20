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
    /** Its ports take wires (the scene and entity levels of the open scene) */
    editable: boolean;
    /** While a wire is dragged: the handles (`in:act:play`) that would take it; null when nothing is dragged */
    takes: ReadonlySet<string> | null;
    onpick: (box: FlowBox) => void;
    onenter: (box: FlowBox) => void;
    /** The box's + : show one of its hidden ports (the panel opens the menu at `at`) */
    onexpose: (box: FlowBox, at: { x: number; y: number }) => void;
  }
</script>

<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import Icon from "#lib/components/Icon.svelte";
  import { BOX_HEAD, PORT_ROW, handleId } from "#lib/logic/flow.js";

  /**
   * One box of the Logic canvas (#334 L-T3), an `@xyflow/svelte` custom node: a level's node (its label and detail, its
   * ports as handles – inlets left, outlets right, their shape by signal) or a stub at the level's border. A click picks
   * (the canvas's `onnodeclick`); a double-click, Enter or the arrow button enters the box's level – a stub follows to its far
   * end. While `editable`, a drag from a port to a port is a connect (the canvas reports it), and a rule's `+` outlet adds an
   * action.
   *
   * The ports a spec gives (L-T6) are rows under the head, each with its name: wired or exposed ones only – the box's **+**
   * lists the hidden ones to show (the Blender way). While a wire is dragged, the handles that take it are drawn heavy and the
   * others fade (`takes`, strictly typed – B8). An image node's body shows its picture.
   */
  let { data }: { data: LogicBoxData } = $props();

  const box = $derived(data.box);
  const node = $derived(box.node);
  const enterable = $derived(!!node?.enter || !!box.stub);
  // The grammar's ports sit along the head; a spec's ports are rows below it, inlets first
  const ins = $derived(box.ports.filter(p => p.dir === "in" && !p.kind));
  const outs = $derived(box.ports.filter(p => p.dir === "out" && !p.kind));
  const rows = $derived([...box.ports.filter(p => p.kind && p.dir === "in"), ...box.ports.filter(p => p.kind && p.dir === "out")]);
  const top = (i: number, n: number) => `top: ${((i + 1) / (n + 1)) * BOX_HEAD}px`;
  const rowTop = (i: number) => BOX_HEAD + i * PORT_ROW + PORT_ROW / 2;
  const KIND_WORD: Record<string, string> = {
    event: "Event", rule: "Rule", variable: "Variable", node: "Node", plugin: "Plugin", scene: "Scene", group: "Group", entity: "Entity", far: "Elsewhere",
  };
  const label = $derived(box.stub ? box.stub.label : node!.label);
  const detail = $derived(box.stub ? (data.never ? "never fires: another scene" : "elsewhere") : node!.detail);
  const word = $derived(box.stub ? "Stub" : KIND_WORD[node!.kind] ?? node!.kind);
  /** A handle while a wire is dragged: it takes the wire, or it fades */
  const lit = (id: string) => (data.takes ? (data.takes.has(id) ? " takes" : " refuses") : "");

  const keydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && enterable) {
      e.preventDefault();
      data.onenter(box);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      data.onpick(box);
    }
  };
  const expose = (e: MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    data.onexpose(box, { x: rect.left, y: rect.bottom + 4 });
  };
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="box {box.stub ? 'stub' : node!.kind}" class:selected={data.selected} class:flash={data.flash} class:dim={data.dim} class:problem={!!node?.problem}
  class:never={data.never} class:far={!!node?.far} class:in={box.stub?.side === "in"} class:out={box.stub?.side === "out"} class:rows={rows.length > 0}
  style:height="{box.h}px"
  role="button" tabindex="0" aria-label="{word} {label} – {detail}{node?.problem ? ` – ${node.problem}` : ''}{enterable ? ' – Enter opens it' : ''}"
  title="{word}: {label} – {detail}{node?.problem ? `\n${node.problem}` : ''}{enterable ? '\nDouble-click to open' : ''}"
  ondblclick={e => { if (enterable) { e.stopPropagation(); data.onenter(box); } }} onkeydown={keydown}>
  {#each ins as p, i (p.id)}
    <Handle type="target" position={Position.Left} id={handleId(p)} class="port sig-{p.signal}{lit(handleId(p))}" style={top(i, ins.length)} isConnectable={data.editable} title={p.label} />
  {/each}
  <span class="head">
    {#if node?.preview}<img class="preview" src={node.preview} alt="" loading="lazy" />{/if}
    <span class="text">
      <span class="label">{label}</span>
      <span class="detail">{detail}</span>
    </span>
    {#if box.hidden.length && data.editable}
      <button type="button" class="expose nodrag" aria-label="Show a port of {label} ({box.hidden.length} hidden)" title="Show a port ({box.hidden.length} hidden)"
        onclick={expose} ondblclick={e => e.stopPropagation()}>+</button>
    {/if}
    {#if enterable}
      <button type="button" class="enter nodrag" aria-label="Open {label}" title={box.stub ? "Go there" : "Open its level"}
        onclick={e => { e.stopPropagation(); data.onenter(box); }}><Icon name="next" /></button>
    {/if}
  </span>
  {#each rows as p, i (`${p.dir}:${p.id}`)}
    <span class="row {p.dir}" style:top="{rowTop(i) - PORT_ROW / 2}px" style:height="{PORT_ROW}px" title="{p.owner ? `${p.owner} · ` : ''}{p.label}{p.detail ? ` – ${p.detail}` : ''}">{p.label}</span>
    <Handle type={p.dir === "in" ? "target" : "source"} position={p.dir === "in" ? Position.Left : Position.Right} id={handleId(p)}
      class="port sig-{p.signal} kind-{p.kind}{lit(handleId(p))}" style="top: {rowTop(i)}px" isConnectable={data.editable}
      title="{p.label}{p.detail ? ` – ${p.detail}` : ''}" />
  {/each}
  {#each outs as p, i (p.id)}
    <Handle type="source" position={Position.Right} id={handleId(p)} class="port sig-{p.signal}{p.id === 'do' ? ' add' : ''}{lit(handleId(p))}" style={top(i, outs.length)} isConnectable={data.editable} title={p.id === "do" ? "Drag to a node, a variable or an event: a new action" : p.label} />
  {/each}
</div>

<style>
  .box {
    position: relative; box-sizing: border-box; width: 10.5rem; height: 2.5rem; display: flex; flex-direction: column;
    background: var(--surface); border: 1px solid var(--line); color: var(--text); font-size: .75rem; cursor: pointer;
  }
  .head { flex: none; height: 2.5rem; box-sizing: border-box; display: flex; align-items: center; gap: .25rem; padding: 0 .375rem 0 .5rem; min-width: 0; }
  .box.rows .head { border-bottom: 1px solid var(--line); }
  .preview { flex: none; width: 1.75rem; height: 1.75rem; object-fit: cover; border: 1px solid var(--line); background: var(--control-background); }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.2; }
  .label { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { font-size: .625rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row {
    position: absolute; left: 0; right: 0; box-sizing: border-box; padding: 0 .625rem; display: flex; align-items: center;
    font-size: .625rem; line-height: 1; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
  }
  .row.out { justify-content: flex-end; }
  /* The kinds by shape and line, never by colour (RULES #38) */
  .box.event { border-radius: 999px; }
  .box.event .head { padding-left: .75rem; }
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
  .enter, .expose {
    flex: none; display: grid; place-items: center; width: 1.25rem; height: 1.25rem; padding: 0; border: 0; background: none; color: var(--muted); cursor: pointer;
  }
  .expose { font: inherit; font-size: .875rem; line-height: 1; border: 1px solid var(--line); width: 1rem; height: 1rem; }
  @media (hover: hover) {
    .enter:hover, .expose:hover { color: var(--text); background: var(--hover-background); }
  }
  /* Ports: the signal by shape – event round, value a diamond, node square, scene / address a bar, media a hollow square, far hollow */
  .box :global(.port) { width: .4375rem; height: .4375rem; min-width: 0; min-height: 0; background: var(--surface); border: 1px solid var(--text); border-radius: 0; cursor: default; }
  .box :global(.port.sig-event) { border-radius: 50%; }
  .box :global(.port.sig-value.svelte-flow__handle-left) { transform: translate(-50%, -50%) rotate(45deg); }
  .box :global(.port.sig-value.svelte-flow__handle-right) { transform: translate(50%, -50%) rotate(45deg); }
  .box :global(.port.sig-node) { background: var(--text); }
  .box :global(.port.sig-scene), .box :global(.port.sig-address) { width: .1875rem; height: .625rem; background: var(--text); }
  .box :global(.port.sig-media) { width: .5625rem; height: .5625rem; border-width: 2px; box-sizing: border-box; }
  .box :global(.port.sig-far) { border-style: dotted; }
  /* An action inlet: a rule's verb – a triangle pointing in (an exec pin) */
  .box :global(.port.kind-action) { width: 0; height: 0; background: none; border-style: solid; border-width: .25rem 0 .25rem .4375rem; border-color: transparent transparent transparent var(--text); }
  .box :global(.port.add) {
    width: .75rem; height: .75rem; border-radius: 50%; background: var(--surface); display: grid; place-items: center; font-size: .625rem; line-height: 1;
  }
  .box :global(.port.add::after) { content: "+"; color: var(--text); pointer-events: none; }
  .box :global(.port.connectable) { cursor: crosshair; }
  /* While a wire is dragged: what takes it heavy, the rest faded */
  .box :global(.port.takes) { outline: 2px solid var(--text); outline-offset: 1px; }
  .box :global(.port.refuses) { opacity: .25; }
</style>
