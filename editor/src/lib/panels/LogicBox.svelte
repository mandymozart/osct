<script lang="ts" module>
  import type { FlowBox } from "#lib/logic/flow.js";

  /** What the canvas hands each box (`LogicCanvas.svelte`) */
  export interface LogicBoxData extends Record<string, unknown> {
    box: FlowBox;
    selected: boolean;
    /** The search's hit: drawn heavier until the level changes */
    flash: boolean;
    dim: boolean;
    /** The pointer is over it: its border at full strength, so it reads as the one a click opens */
    hover?: boolean;
    never: boolean;
    /** Its ports take wires (the scene and entity levels of the open scene) */
    editable: boolean;
    /** While a wire is dragged: the handles (`in:act:play`) that would take it; null when nothing is dragged */
    takes: ReadonlySet<string> | null;
    /** Live feedback (#334): the stage just lit it – the pulse's number (a new one pulses again) and a variable's new value */
    live?: { n: number; value?: string } | null;
    onpick: (box: FlowBox) => void;
    onenter: (box: FlowBox) => void;
    /** The box's + : show one of its hidden ports (the panel opens the menu at `at`) */
    onexpose: (box: FlowBox, at: { x: number; y: number }) => void;
    /** The head's chevron: fold the box to its head, or open it; on a folded group's pill, open the group */
    onfold: (box: FlowBox, folded: boolean) => void;
  }
</script>

<script lang="ts">
  import { Handle, Position, useViewport } from "@xyflow/svelte";
  import { contentUrl } from "@engine/content/game-config";
  import Icon from "#lib/components/Icon.svelte";
  import { BOX_HEAD, DISPLAY_ROW, DIVIDER, PORT_ROW, handleId, rowsOf, type FlowPort } from "#lib/logic/flow.js";
  import { LABEL_ZOOM, SIGNAL_STYLES, signalToken } from "#lib/logic/signals.js";

  /**
   * One box of the Logic canvas (#334 L-T3, L-T7), an `@xyflow/svelte` custom node drawn as the SCUTOONS deck's node card
   * (`node_card.rs`): one thin border in its kind's colour, the head faintly tinted with the kind's icon, the name, the
   * kind's word and the fold chevron; every named port a row on the card's edge, its pin shaped and coloured by its signal
   * (`logic/signals.ts`, L-T8) – inlets left, outlets right – its label small, hidden when zoomed out below 0.55. Folded,
   * the card is its head alone. A level's node, a stub at the level's border (far), or a folded group's pill (its colour).
   *
   * A click picks (the canvas's `onnodeclick`); the **head drags** the box (the canvas pins it where it is let go); a
   * double-click, Enter or the arrow button enters the box's level – a stub follows to its far end. While `editable`, a drag
   * from a port to a port is a connect (the canvas reports it), and a rule's `+` outlet adds an action. The ports a spec
   * gives (L-T6) show only while wired or exposed – the box's **+** lists the hidden ones. While a wire is dragged, the
   * handles that take it are drawn heavy and the others fade (`takes`, strictly typed – B8). An image node shows its
   * picture in place of the icon.
   *
   * **Display rows** (#334): what a plugin's code reads, sets and drives is plain text under its pins, below a thin divider,
   * no pins – a click opens the plugin in the Code tab (the box's own click). Invisible anchors at each row's sides (and the
   * head's, and every box's head for the far end) carry the dotted reference lines (`LogicRef`); they never connect.
   *
   * **Trace** (#334): while the stage just lit it (a rule that ran, an event that fired, a variable that changed), its border
   * pulses once in its kind's colour; a variable shows its new value in its head for that moment (`= true`).
   */
  let { data }: { data: LogicBoxData } = $props();

  const viewport = useViewport();
  const labels = $derived(viewport.current.zoom >= LABEL_ZOOM);

  const box = $derived(data.box);
  const node = $derived(box.node);
  const pill = $derived(box.pill ?? null);
  const enterable = $derived(!!node?.enter || !!box.stub);
  const rows = $derived(box.folded ? { ins: [], outs: [], count: 0 } : rowsOf(box.ports));
  /** The ports on the head: unnamed ones and a rule's +; folded, every port */
  const headIns = $derived(box.ports.filter(p => p.dir === "in" && !rows.ins.includes(p)));
  const headOuts = $derived(box.ports.filter(p => p.dir === "out" && !rows.outs.includes(p)));
  const headTop = (i: number, n: number) => (box.folded ? BOX_HEAD / 2 : ((i + 1) / (n + 1)) * BOX_HEAD);
  const rowTop = (i: number) => BOX_HEAD + i * PORT_ROW + PORT_ROW / 2;
  const KIND_WORD: Record<string, string> = {
    event: "event", rule: "rule", variable: "variable", node: "node", plugin: "plugin", scene: "scene", group: "group", entity: "entity", far: "elsewhere",
  };
  const KIND_ICON: Record<string, string> = {
    event: "play", rule: "list", variable: "sliders", node: "node", plugin: "code", scene: "film", group: "folder", far: "link",
  };
  const label = $derived(pill ? pill.label : box.stub ? box.stub.label : node!.label);
  const detail = $derived(pill ? `${pill.members.length} ${pill.members.length === 1 ? "box" : "boxes"} folded` : box.stub ? (data.never ? "never fires: another scene" : "elsewhere") : node!.detail);
  const word = $derived(pill ? "group" : box.stub ? "stub" : KIND_WORD[node!.kind] ?? node!.kind);
  const icon = $derived(pill ? "folder" : box.stub ? "link" : KIND_ICON[node!.kind] ?? "node");
  /** The kind's colour: a signal's token, a folded group's own colour, or muted */
  const kind = $derived(pill ? pill.colour : box.colour ? `var(${signalToken(box.colour)})` : "var(--muted)");
  /** A handle while a wire is dragged: it takes the wire, or it fades */
  const lit = (id: string) => (data.takes ? (data.takes.has(id) ? " takes" : " refuses") : "");
  const pinClass = (p: FlowPort, extra = "") => `pin shape-${SIGNAL_STYLES[p.deck].shape} sig-${p.deck}${p.kind ? ` kind-${p.kind}` : ""}${extra}${lit(handleId(p))}`;
  const pinStyle = (p: FlowPort, top: number) => `top: ${top}px; --pin: var(${signalToken(p.deck)})`;
  /** A plugin's pins (#334): its emits into a rule's on, a rule's emit into its hears – the event names they stand for */
  const busNames = (p: FlowPort) => (node?.kind === "plugin" ? (p.id === "emits" ? node.bus?.emits : p.id === "hears" ? node.bus?.hears : undefined) : undefined);
  const portTitle = (p: FlowPort) => {
    const names = busNames(p);
    if (names) return `${p.label}: ${names.join(", ") || "nothing a rule can wire"} – ${p.id === "emits" ? "wire it to a rule's on" : "wire a rule's action here: it emits it"}`;
    return `${p.owner ? `${p.owner} · ` : ""}${p.label || p.deck}${p.detail ? ` – ${p.detail}` : ""}`;
  };
  const pinOf = (p: FlowPort, extra = "") => pinClass(p, extra);
  const displayRows = $derived(box.folded ? [] : box.rows);
  const dividerTop = $derived(BOX_HEAD + rows.count * PORT_ROW + DIVIDER / 2);
  const displayTop = (i: number) => BOX_HEAD + rows.count * PORT_ROW + DIVIDER + i * DISPLAY_ROW;

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
  const fold = (e: MouseEvent) => {
    e.stopPropagation();
    data.onfold(box, !box.folded);
  };
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="box {pill ? 'folded-group' : box.stub ? 'stub' : node!.kind}" class:selected={data.selected} class:flash={data.flash} class:dim={data.dim} class:pointed={data.hover} class:problem={!!node?.problem && node.problemSeverity !== "warning"} class:warning={node?.problemSeverity === "warning"}
  class:never={data.never} class:far={!!node?.far || !!box.stub} class:folded={box.folded} class:pinned={box.pinned} class:labels
  style:height="{box.h}px" style:width="{box.w}px" style:--kind={kind}
  role="button" tabindex="0" aria-label="{word} {label} – {detail}{node?.problem ? ` – ${node.problem}` : ''}{enterable ? ' – Enter opens it' : ''}"
  title="{word}: {label} – {detail}{node?.problem ? `\n${node.problem}` : ''}{enterable ? '\nDouble-click to open' : ''}{data.editable && !box.stub ? '\nDrag its head to place it' : ''}"
  ondblclick={e => { if (enterable) { e.stopPropagation(); data.onenter(box); } }} onkeydown={keydown}>
  {#if data.live}
    {#key data.live.n}<span class="live-ring" aria-hidden="true"></span>{/key}
  {/if}
  <span class="head drag-head">
    {#if node?.preview}
      <img class="preview" src={contentUrl(node.preview)} alt="" loading="lazy" onerror={e => ((e.currentTarget as HTMLImageElement).hidden = true)} />
    {:else}
      <span class="kind-icon"><Icon name={icon as never} /></span>
    {/if}
    <span class="label">{label}</span>
    {#if data.live?.value !== undefined}
      <span class="live-value" title="its new value">= {data.live.value}</span>
    {:else}
      <span class="word">{word}</span>
    {/if}
    {#if box.hidden.length && data.editable && !box.folded}
      <button type="button" class="expose nodrag" aria-label="Show a port of {label} ({box.hidden.length} hidden)" title="Show a port ({box.hidden.length} hidden)"
        onclick={expose} ondblclick={e => e.stopPropagation()}>+</button>
    {/if}
    {#if enterable}
      <button type="button" class="enter nodrag" aria-label="Open {label}" title={box.stub ? "Go there" : "Open its level"}
        onclick={e => { e.stopPropagation(); data.onenter(box); }}><Icon name="next" /></button>
    {/if}
    {#if !box.stub && (data.editable || pill)}
      <button type="button" class="fold nodrag" aria-label="{box.folded ? 'Open' : 'Fold'} {label}" aria-expanded={!box.folded} title={pill ? "Open the group" : box.folded ? "Open the box" : "Fold the box to its head"}
        onclick={fold} ondblclick={e => e.stopPropagation()}><Icon name={box.folded ? "next" : "down"} /></button>
    {/if}
  </span>
  {#each headIns as p, i (p.id)}
    <Handle type="target" position={Position.Left} id={handleId(p)} class={pinOf(p)} style={pinStyle(p, headTop(i, headIns.length))} isConnectable={data.editable} title={portTitle(p)} />
  {/each}
  {#each headOuts as p, i (p.id)}
    <Handle type="source" position={Position.Right} id={handleId(p)} class={pinOf(p, p.id === "do" ? " add" : "")} style={pinStyle(p, headTop(i, headOuts.length))} isConnectable={data.editable}
      title={p.id === "do" ? "Drag to a node, a variable or an event: a new action" : portTitle(p)} />
  {/each}
  {#each rows.ins as p, i (`in:${p.id}`)}
    <span class="pin-label in" style:top="{rowTop(i) - PORT_ROW / 2}px" style:height="{PORT_ROW}px" title={portTitle(p)}>{p.label}</span>
    <Handle type="target" position={Position.Left} id={handleId(p)} class={pinOf(p)} style={pinStyle(p, rowTop(i))} isConnectable={data.editable} title={portTitle(p)} />
  {/each}
  {#each rows.outs as p, i (`out:${p.id}`)}
    <span class="pin-label out" style:top="{rowTop(i) - PORT_ROW / 2}px" style:height="{PORT_ROW}px" title={portTitle(p)}>{p.label}</span>
    <Handle type="source" position={Position.Right} id={handleId(p)} class={pinOf(p)} style={pinStyle(p, rowTop(i))} isConnectable={data.editable} title={portTitle(p)} />
  {/each}
  {#if displayRows.length}
    <span class="divider" style:top="{dividerTop}px" aria-hidden="true"></span>
  {/if}
  {#each displayRows as row, i (row.id)}
    <span class="display-row" style:top="{displayTop(i)}px" style:height="{DISPLAY_ROW}px" title="{row.text} – from {label}'s code; click to open it in the Code tab">{row.text}</span>
    <Handle type="source" position={Position.Left} id="ref:l:{row.id}" class="ref-anchor" style="top: {displayTop(i) + DISPLAY_ROW / 2}px" isConnectable={false} />
    <Handle type="source" position={Position.Right} id="ref:r:{row.id}" class="ref-anchor" style="top: {displayTop(i) + DISPLAY_ROW / 2}px" isConnectable={false} />
  {/each}
  <!-- The reference lines' anchors on the head: the far end of a line (every box), its start while the box is folded -->
  <Handle type="target" position={Position.Left} id="ref:l" class="ref-anchor" style="top: {BOX_HEAD / 2}px" isConnectable={false} />
  <Handle type="target" position={Position.Right} id="ref:r" class="ref-anchor" style="top: {BOX_HEAD / 2}px" isConnectable={false} />
  <Handle type="source" position={Position.Left} id="ref:hl" class="ref-anchor" style="top: {BOX_HEAD / 2}px" isConnectable={false} />
  <Handle type="source" position={Position.Right} id="ref:hr" class="ref-anchor" style="top: {BOX_HEAD / 2}px" isConnectable={false} />
</div>

<style>
  /* The deck's node card (node_card.rs): radius 0.54rem, the control fill, one 1px border in the kind's colour at 55 %, no shadow */
  .box {
    position: relative; box-sizing: border-box; display: flex; flex-direction: column; border-radius: .54rem;
    background: var(--control-background); border: 1px solid color-mix(in srgb, var(--kind) 55%, transparent); color: var(--text); font-size: .75rem; cursor: pointer;
  }
  .box.far { border-color: color-mix(in srgb, var(--kind) 35%, transparent); }
  /* The head: 2rem, tinted with the kind's colour (9 %), a 1px line under it (22 %) */
  .head {
    flex: none; align-self: stretch; height: 2rem; box-sizing: border-box; display: flex; align-items: center; gap: .375rem; padding: 0 .375rem 0 .5rem; min-width: 0;
    background: color-mix(in srgb, var(--kind) 9%, var(--control-background)); border-radius: calc(.54rem - 1px) calc(.54rem - 1px) 0 0;
    border-bottom: 1px solid color-mix(in srgb, var(--kind) 22%, transparent); cursor: grab;
  }
  .box.folded .head { border-bottom: 0; border-radius: calc(.54rem - 1px); height: 100%; }
  .box:not(.labels) .word { display: none; }
  .kind-icon { flex: none; display: grid; place-items: center; color: var(--kind); font-size: .8125rem; }
  .preview { flex: none; width: 1.25rem; height: 1.25rem; object-fit: cover; border-radius: .2rem; background: var(--surface); }
  .label { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .word { flex: none; max-width: 40%; font-size: .625rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* A pin's label: small, the text at 80 %; hidden when zoomed out (the deck's 0.55) */
  .pin-label {
    position: absolute; box-sizing: border-box; width: 50%; display: flex; align-items: center; padding: 0 .75rem;
    font-size: .625rem; line-height: 1; color: color-mix(in srgb, var(--text) 80%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
  }
  .pin-label.in { left: 0; }
  .pin-label.out { right: 0; justify-content: flex-end; }
  .box:not(.labels) .pin-label { visibility: hidden; }
  /* A folded group's pill: one round pill tinted in its colour */
  .box.folded-group { border-radius: 999px; border-color: color-mix(in srgb, var(--kind) 55%, transparent); }
  .box.folded-group .head { border-radius: 999px; background: color-mix(in srgb, var(--kind) 22%, var(--control-background)); padding-left: .75rem; }
  .box.stub.never { opacity: .7; }
  /* Selected: the deck's accent outline, 2px just outside the card */
  .box.selected { outline: 2px solid var(--signal-accent); outline-offset: 1px; }
  .box.flash { outline: 2px solid var(--text); outline-offset: 3px; }
  .box.problem { border-color: var(--danger); }
  /* a warning (nothing hears, sets or emits it): dashed, no colour (RULES #38) */
  .box.warning { border-style: dashed; }
  .box.problem .head { background: color-mix(in srgb, var(--danger) 12%, var(--control-background)); }
  .box.dim { opacity: .55; }
  /* Live feedback (#334): one pulse of the border in the kind's colour; reduced motion keeps it still for its moment */
  .live-ring {
    position: absolute; inset: -1px; border: 2px solid var(--kind); border-radius: inherit; pointer-events: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--kind) 28%, transparent); animation: live-ring 1s ease-out forwards;
  }
  @keyframes live-ring { from { opacity: 1; } 70% { opacity: .8; } to { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .live-ring { animation: none; } }
  .live-value { flex: none; max-width: 45%; font-size: .625rem; font-weight: 600; color: var(--kind); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .box.pointed:not(.selected) { border-color: var(--kind); }
  .box.pointed .enter, .box.pointed .fold { color: var(--text); }
  .box:focus-visible { outline: 2px solid var(--signal-accent); outline-offset: 1px; }
  .enter, .expose, .fold {
    flex: none; display: grid; place-items: center; width: 1.125rem; height: 1.125rem; padding: 0; border: 0; border-radius: .25rem; background: none; color: var(--muted); cursor: pointer;
  }
  .expose { font: inherit; font-size: .875rem; line-height: 1; border: 1px solid color-mix(in srgb, var(--kind) 35%, transparent); width: 1rem; height: 1rem; }
  @media (hover: hover) {
    .enter:hover, .expose:hover, .fold:hover { color: var(--text); background: var(--hover-background); }
  }
  /* Pins (the deck's `d.pin`): radius 0.32rem on the card's edge, in the signal's colour, shaped by signal */
  .box :global(.pin) {
    width: .64rem; height: .64rem; min-width: 0; min-height: 0; box-sizing: border-box; background: var(--pin); border: 1px solid var(--control-background); border-radius: 50%; cursor: default;
  }
  .box :global(.pin.shape-square) { border-radius: .125rem; }
  .box :global(.pin.shape-diamond) { width: .56rem; height: .56rem; border-radius: .0625rem; }
  .box :global(.pin.shape-diamond.svelte-flow__handle-left) { transform: translate(-50%, -50%) rotate(45deg); }
  .box :global(.pin.shape-diamond.svelte-flow__handle-right) { transform: translate(50%, -50%) rotate(45deg); }
  /* An event's triangle points along the flow (left to right) */
  .box :global(.pin.shape-triangle) { border: 0; border-radius: 0; width: .6rem; height: .72rem; clip-path: polygon(0 0, 100% 50%, 0 100%); }
  .box :global(.pin.shape-ring) { background: var(--control-background); border: 2px solid var(--pin); }
  /* A rule's + : where a new action is dragged from */
  .box :global(.pin.add) {
    width: .875rem; height: .875rem; border-radius: 50%; clip-path: none; background: var(--control-background); border: 1px solid var(--pin); display: grid; place-items: center; font-size: .625rem; line-height: 1;
  }
  .box :global(.pin.add::after) { content: "+"; color: var(--text); pointer-events: none; }
  .box :global(.pin.connectable) { cursor: crosshair; }
  /* Display rows (#334): a thin divider, then plain text – no pins; a click opens the plugin's code */
  .divider { position: absolute; left: .5rem; right: .5rem; height: 0; border-top: 1px solid color-mix(in srgb, var(--kind) 22%, transparent); pointer-events: none; }
  .display-row {
    position: absolute; left: 0; right: 0; box-sizing: border-box; display: flex; align-items: center; padding: 0 .75rem;
    font-size: .625rem; line-height: 1; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .box:not(.labels) .display-row { visibility: hidden; }
  /* A reference line's anchor: invisible, never takes the pointer, never connects */
  .box :global(.ref-anchor) { width: 1px; height: 1px; min-width: 0; min-height: 0; border: 0; background: none; opacity: 0; pointer-events: none; }
  /* While a wire is dragged: what takes it heavy, the rest faded */
  .box :global(.pin.takes) { outline: 2px solid var(--text); outline-offset: 1px; clip-path: none; }
  .box :global(.pin.refuses) { opacity: .25; }
</style>
