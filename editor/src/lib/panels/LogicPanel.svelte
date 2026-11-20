<script lang="ts">
  import { getPlugins } from "@engine/content/game-config";
  import type { PluginData } from "@engine/types";
  import Icon from "#lib/components/Icon.svelte";
  import { content } from "#lib/content.svelte.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { selection } from "#lib/selection.svelte.js";
  import { getPlugin } from "#lib/api.js";
  import { pluginCodeUses, type PluginUses } from "#lib/logic/plugin-code.js";
  import { sceneLogic, type LogicNode, type ScenePick } from "#lib/logic/scene.js";
  import { LOGIC_SIZE, layoutLogic } from "#lib/logic/layout.js";

  /**
   * The **Logic** panel (#239, the `nodes` icon): the open scene's logic as a graph, read-only – its events, the rules of
   * its `behaviour` components, the variables they read and set, the nodes they act on and the plugins on its nodes
   * (`logic/scene.ts` builds it from the draft through the logic model's scene level, `logic/layout.ts` lays it out left to right). What a plugin's code hears,
   * emits, reads and sets is read from its source (stored, else the compiled module). A click on a graph node selects
   * what it stands for: a rule, a node's event or a node selects that node (its rules are in the Inspector), a plugin
   * opens the Code tab on it (`onpick`). Problems across the experience are listed under the graph, in the error colour.
   */
  let { experienceId, sceneId, onpick }: { experienceId: string; sceneId: string; onpick: (pick: ScenePick) => void } = $props();

  /** What each plugin's code uses, by plugin id – read once per experience and Run / save */
  let code = $state<Record<string, PluginUses>>({});
  let fit = $state(true);
  let hovered = $state<string | null>(null);

  const declared = $derived.by((): PluginData[] => {
    void plugins.version;
    void content.scenes;
    return getPlugins();
  });

  const readSource = async (plugin: PluginData): Promise<string | null> => {
    try {
      return (await getPlugin(experienceId, plugin.id)).plugin.source;
    } catch {
      try {
        const response = await fetch(plugin.src);
        return response.ok ? await response.text() : null;
      } catch {
        return null;
      }
    }
  };

  $effect(() => {
    const list = declared;
    void plugins.stored;
    let current = true;
    void Promise.all(list.map(async p => [p.id, await readSource(p)] as const)).then(read => {
      if (current) code = Object.fromEntries(read.flatMap(([id, source]) => (source === null ? [] : [[id, pluginCodeUses(source)]])));
    });
    return () => { current = false; };
  });

  const scene = $derived(content.scene(sceneId));
  const graph = $derived(scene ? sceneLogic({ scenes: content.scenes, plugins: declared, code }, scene.id) : null);
  const layout = $derived(graph ? layoutLogic(graph.nodes.map(n => n.id), graph.edges) : null);
  const { w, h } = LOGIC_SIZE;
  const PAD = 8;

  const selectedPick = (pick: ScenePick | null): boolean =>
    pick?.kind === "node" && selection.target === pick.target && !selection.onTarget && selection.node.join(".") === pick.path.join(".");
  const near = (id: string, e: { from: string; to: string }) => e.from === id || e.to === id;
  const lit = $derived(hovered && graph ? new Set(graph.edges.filter(e => near(hovered!, e)).flatMap(e => [e.from, e.to])) : null);

  const pick = (node: LogicNode) => { if (node.pick) onpick(node.pick); };
  const KIND_WORD: Record<LogicNode["kind"], string> = { event: "Event", rule: "Rule", variable: "Variable", node: "Node", plugin: "Plugin" };
  const clip = (text: string, room: number) => (text.length > room ? `${text.slice(0, room - 1)}…` : text);
</script>

<div class="logic">
  <div class="bar">
    <span class="legend" aria-label="Legend">
      <span class="key event">event</span><span class="key rule">rule</span><span class="key variable">variable</span><span class="key node">node</span><span class="key plugin">plugin</span>
    </span>
    <button type="button" class="icon-button" class:on={fit} aria-pressed={fit} onclick={() => (fit = !fit)} title={fit ? "Actual size" : "Fit the graph into the panel"} aria-label="Fit"
      data-help-name="Fit" data-help="On: the whole graph fits the panel. Off: its actual size – scroll to move around."><Icon name="maximize" /></button>
  </div>
  {#if !graph || !layout}
    <p class="muted small">{content.loading ? "Loading the draft…" : "No scene."}</p>
  {:else if !graph.nodes.length}
    <p class="muted small">This scene has no logic yet: no behaviour rules and no plugin on its nodes. Add a behaviour to a node in the Inspector.</p>
  {:else}
    <div class="canvas" class:fit>
      <svg viewBox="{-PAD} {-PAD} {layout.width + 2 * PAD} {layout.height + 2 * PAD}" width={fit ? "100%" : layout.width + 2 * PAD} height={fit ? undefined : layout.height + 2 * PAD}
        role="group" aria-label="The scene's logic">
        <defs>
          <marker id="logic-arrow" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" class="arrow" />
          </marker>
        </defs>
        {#each layout.edges as e, i (i)}
          <g class="edge" class:back={e.back} class:dim={lit && !(near(hovered!, e))} class:lit={lit && near(hovered!, e)}>
            <path d={e.d} marker-end="url(#logic-arrow)" />
            <text x={e.lx} y={e.ly - 3} text-anchor="middle">{e.label}</text>
          </g>
        {/each}
        {#each graph.nodes as n (n.id)}
          {@const at = layout.nodes[n.id]}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <g class="node {n.kind}" class:problem={!!n.problem} class:selected={selectedPick(n.pick)} class:dim={lit && !lit.has(n.id)} class:pickable={!!n.pick}
            transform="translate({at.x},{at.y})" role={n.pick ? "button" : "img"} tabindex={n.pick ? 0 : -1}
            aria-label="{KIND_WORD[n.kind]} {n.label} – {n.detail}{n.problem ? ` – ${n.problem}` : ''}"
            onclick={() => pick(n)} onkeydown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(n); } }}
            onpointerenter={() => (hovered = n.id)} onpointerleave={() => { if (hovered === n.id) hovered = null; }}>
            <title>{KIND_WORD[n.kind]}: {n.label} – {n.detail}{n.problem ? `\n${n.problem}` : ""}</title>
            <rect width={w} height={h} rx={n.kind === "event" ? h / 2 : n.kind === "variable" ? 2 : 6} />
            {#if n.kind === "plugin"}<rect class="inner" x="3" y="3" width={w - 6} height={h - 6} rx="4" />{/if}
            <text class="label" x={w / 2} y={h / 2 - 3} text-anchor="middle">{clip(n.label, 24)}</text>
            <text class="detail" x={w / 2} y={h / 2 + 11} text-anchor="middle">{clip(n.detail, 30)}</text>
          </g>
        {/each}
      </svg>
    </div>
  {/if}
  {#if graph?.problems.length}
    <ul class="problems" aria-label="Problems">
      {#each graph.problems as p (p)}<li class="danger small">{p}</li>{/each}
    </ul>
  {/if}
</div>

<style>
  .logic { display: flex; flex-direction: column; gap: .375rem; min-height: 0; flex: 1; padding: .375rem .5rem .5rem; }
  .bar { display: flex; align-items: center; gap: .5rem; justify-content: space-between; }
  .legend { display: flex; flex-wrap: wrap; gap: .25rem; font-size: var(--text-small); color: var(--muted); }
  .key { padding: 0 .375rem; border: 1px solid var(--line); border-radius: 4px; }
  .key.event { border-radius: 999px; }
  .key.variable { border-style: dashed; border-radius: 1px; }
  .key.node { background: var(--control-background); }
  .key.plugin { border-width: 3px; border-style: double; }
  .canvas { flex: 1; min-height: 0; overflow: auto; touch-action: pan-x pan-y; }
  .canvas.fit svg { max-height: 100%; }
  svg { display: block; font-family: var(--font); }
  .edge path { fill: none; stroke: var(--muted); stroke-width: 1.25; }
  .edge.back path { stroke-dasharray: 4 3; }
  .edge text { font-size: 10px; fill: var(--muted); paint-order: stroke; stroke: var(--surface); stroke-width: 3px; }
  .edge.lit path { stroke: var(--text); stroke-width: 2; }
  .edge.lit text { fill: var(--text); }
  .arrow { fill: var(--muted); }
  .dim { opacity: .3; }
  .node rect { fill: var(--surface); stroke: var(--line); stroke-width: 1.25; }
  .node.rule rect { stroke: var(--text); }
  .node.variable rect { stroke-dasharray: 4 2; stroke: var(--text); }
  .node.node rect { fill: var(--control-background); }
  .node.plugin rect { stroke: var(--text); }
  .node.plugin rect.inner { fill: none; stroke-width: 1; }
  .node .label { font-size: 12px; fill: var(--text); font-weight: 600; }
  .node .detail { font-size: 10px; fill: var(--muted); }
  .node.pickable { cursor: pointer; }
  .node:focus-visible { outline: none; }
  .node:focus-visible rect { stroke-width: 2.5; }
  .node.selected rect { fill: var(--selected-background); stroke: var(--text); stroke-width: 2; }
  .node.problem rect { stroke: var(--danger); stroke-width: 2; }
  @media (hover: hover) {
    .node.pickable:hover rect { fill: var(--hover-background); }
  }
  .problems { margin: 0; padding: 0 0 0 1rem; display: flex; flex-direction: column; gap: .125rem; max-height: 6rem; overflow-y: auto; }
</style>
