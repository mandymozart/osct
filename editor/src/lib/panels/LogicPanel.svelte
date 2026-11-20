<script lang="ts">
  import { onMount, untrack, type Component } from "svelte";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { getPlugins } from "@engine/content/game-config";
  import type { PluginData } from "@engine/types";
  import Icon from "#lib/components/Icon.svelte";
  import Toggle from "#lib/components/Toggle.svelte";
  import { content } from "#lib/content.svelte.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { selection } from "#lib/selection.svelte.js";
  import { getPlugin } from "#lib/api.js";
  import { pluginCodeUses, type PluginUses } from "#lib/logic/plugin-code.js";
  import { project, type LogicContent } from "#lib/logic/project.js";
  import { flowOf, type FlowBox } from "#lib/logic/flow.js";
  import {
    decodeContext, encodeContext, followSelection, levelName, parentLevel, pickSelected, sameContext, sceneOfContext, searchIndex, searchLogic,
    stageMove, type SearchHit, type StageMove,
  } from "#lib/logic/navigation.js";
  import type { Context, LogicPick } from "#lib/logic/types.js";

  /**
   * The **Logic** panel (#239, #334 L-T3 – research §6): the experience's logic as a graph, **one level at a time** – the
   * experience (groups, scenes, plugins, the variables and core events that cross scenes), a group, a scene, a target's
   * entity – read-only. `logic/project.ts` computes the level's view from the draft, `logic/flow.ts` places it, and
   * `LogicCanvas.svelte` (`@xyflow/svelte`, loaded on first use) draws it.
   *
   * - **The level lives in one place**: `context`, set only by `go()`, and mirrored to the URL as `?logic=` (replaceState: a
   *   reload or a shared link lands on the same level, no history entry per step).
   * - **Moving**: a double-click, Enter or a box's arrow enters its level; the breadcrumb (`View.levels`) and ↑ / Backspace /
   *   Alt+↑ go back up; a stub at the border goes to its far end; the search finds any box of the experience and of each
   *   scene, goes to its level and marks it.
   * - **The stage follows** (§6.3, `onmove`): entering a scene opens it like the Scenes panel, entering an entity selects its
   *   node, a group or the experience selects it. **And the reverse** while *Follow* is on: a selection elsewhere moves the
   *   view to the deepest level that shows it (`followSelection`). A click on a box picks it (`onpick`): a node, a plugin
   *   (the Code tab), a group, the open scene.
   * - What a plugin's code hears, emits, reads and sets is read from its source (stored, else the compiled module).
   *   Problems across the experience are listed under the graph, in the error colour.
   */
  let { experienceId, sceneId, onpick, onmove }: {
    experienceId: string;
    sceneId: string;
    onpick: (pick: LogicPick) => void;
    onmove: (move: StageMove) => void;
  } = $props();

  /** What each plugin's code uses, by plugin id – read once per experience and Run / save */
  let code = $state<Record<string, PluginUses>>({});

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

  const logic = $derived<LogicContent>({ scenes: content.scenes, groups: content.groups, plugins: declared, code });

  // ── The level: one place, one setter ──
  /** The level the URL names – a scene's level only on its own scene's route */
  const fromUrl = untrack(() => {
    const asked = decodeContext(page.url.searchParams.get("logic"));
    const scene = asked && sceneOfContext(asked);
    return asked && (scene === null || scene === sceneId) ? asked : null;
  });
  let context = $state<Context>(untrack(() => fromUrl ?? { level: "scene", scene: sceneId }));
  /** The search's pick: drawn marked until the level changes */
  let flash = $state<string | null>(null);
  /** The view moves with the selection elsewhere (§6.3, the reverse) */
  let follow = $state(true);

  /** The one way the level changes; `stage`: the workspace follows (a move made here – not one that follows the workspace) */
  const go = (next: Context, { stage = true, mark = null as string | null } = {}) => {
    flash = mark;
    if (sameContext(next, context)) return;
    context = next;
    if (stage) onmove(stageMove(next));
  };

  const view = $derived(project(logic, context));
  const flow = $derived(flowOf(view));
  const levelKey = $derived(encodeContext(context));
  const up = $derived(parentLevel(view));

  // A level from the URL: the workspace shows it too (a node selected, a group, the experience)
  onMount(() => {
    if (fromUrl && fromUrl.level !== "scene") onmove(stageMove(fromUrl));
  });

  // The URL carries the level (`?logic=`, decision L8) – again after a route change, which drops the query
  $effect(() => {
    const value = levelKey;
    void page.url.pathname;
    untrack(() => {
      const url = new URL(window.location.href);
      if (url.searchParams.get("logic") === value) return;
      url.searchParams.set("logic", value);
      // Before the router is up (the first render) it refuses: the next change writes it
      replaceState(url, page.state).catch(() => {});
    });
  });

  // The selection elsewhere (the stage, the tree, the Scenes panel, the search) moves the view while it follows
  $effect(() => {
    const state = selection.snapshot();
    const id = sceneId;
    if (!follow) return;
    untrack(() => {
      const next = followSelection(view, state, id);
      go(next, { stage: false, mark: sameContext(next, context) ? flash : null });
    });
  });

  // ── Boxes ──
  const selectedBox = (box: FlowBox): boolean => !!box.node && pickSelected(box.node.pick, selection.snapshot(), sceneId, view);
  const pickBox = (box: FlowBox) => {
    if (box.stub) return enterBox(box);
    if (box.node?.pick) onpick(box.node.pick);
  };
  const enterBox = (box: FlowBox) => {
    if (box.stub) {
      const near = box.stub.side === "in" ? box.stub.edge.to[0] : box.stub.edge.from[0];
      go(box.stub.far, { mark: near });
    } else if (box.node?.enter) go(box.node.enter);
  };
  const goUp = () => { if (up) go(up); };
  const keydown = (e: KeyboardEvent) => {
    const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select");
    if (typing) return;
    if (e.key === "Backspace" || (e.altKey && e.key === "ArrowUp")) {
      e.preventDefault();
      goUp();
    }
  };

  // ── Search ──
  let query = $state("");
  let searchOpen = $state(false);
  const searching = $derived(query.trim().length > 0);
  const index = $derived.by(() => (searching ? searchIndex(logic) : []));
  const hits = $derived(searching ? searchLogic(index, query) : []);
  const choose = (hit: SearchHit) => {
    go(hit.context, { mark: hit.node });
    query = "";
    searchOpen = false;
  };
  const searchKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && hits.length) {
      e.preventDefault();
      choose(hits[0]);
    } else if (e.key === "Escape") {
      query = "";
      searchOpen = false;
    }
  };

  // ── The canvas, loaded on first use (xyflow stays out of the editor's first load) ──
  let Canvas = $state<Component<any> | null>(null);
  let canvasError = $state<string | null>(null);
  onMount(() => {
    import("./LogicCanvas.svelte").then(m => (Canvas = m.default)).catch(e => (canvasError = String(e?.message ?? e)));
  });

  const never = $derived(flow.wires.some(w => w.never));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="logic" onkeydown={keydown}>
  <div class="bar">
    <button type="button" class="icon-button" disabled={!up} onclick={goUp} aria-label="Up one level" title="Up one level (Backspace)"
      data-help-name="Up one level" data-help="Goes to the level above: from a target's entity to its scene, from a scene to its group or the experience. Backspace or Alt+↑ too."><Icon name="up" /></button>
    <nav class="crumbs" aria-label="Logic levels">
      {#each view.levels as level, i (encodeContext(level))}
        {#if i > 0}<span class="sep" aria-hidden="true">›</span>{/if}
        {#if i < view.levels.length - 1}
          <button type="button" class="crumb" onclick={() => go(level)}>{levelName(logic, level)}</button>
        {:else}
          <span class="crumb current" aria-current="location">{levelName(logic, level)}</span>
        {/if}
      {/each}
    </nav>
    <div class="search">
      <Icon name="search" />
      <input class="field" type="search" placeholder="Search the logic" aria-label="Search the experience's logic" bind:value={query}
        onfocus={() => (searchOpen = true)} onblur={() => setTimeout(() => (searchOpen = false), 150)} onkeydown={searchKey}
        data-help-name="Search the logic" data-help="Every box of the experience and of each scene – events, rules, variables, nodes, plugins, scenes. A hit opens its level and marks the box." />
      {#if searchOpen && searching}
        <ul class="hits" role="listbox" aria-label="Logic search">
          {#each hits as hit (`${encodeContext(hit.context)}|${hit.node}`)}
            <li role="option" aria-selected="false"><button type="button" onmousedown={e => e.preventDefault()} onclick={() => choose(hit)}>
              <span class="hit-label">{hit.label}</span><span class="hit-where">{hit.kind} · {hit.where}</span>
            </button></li>
          {:else}
            <li class="muted small none">Nothing found.</li>
          {/each}
        </ul>
      {/if}
    </div>
    <span class="follow">
      <Toggle on={follow} label="Follow" onchange={on => (follow = on)}
        help="On: selecting a scene, a group or a node elsewhere (the stage, the tree, the Scenes panel) moves the Logic view to its level. Off: the view stays where you put it." />
      <span class="small">Follow</span>
    </span>
  </div>
  <div class="legend small" aria-label="Legend">
    <span class="key event">event</span><span class="key rule">rule</span><span class="key variable">variable</span><span class="key node">node</span><span class="key plugin">plugin</span><span class="key scene">scene</span>
    <span class="wire" title="An event"><svg viewBox="0 0 24 6" aria-hidden="true"><line x1="0" y1="3" x2="24" y2="3" /></svg>event</span>
    <span class="wire value" title="A value (a variable)"><svg viewBox="0 0 24 6" aria-hidden="true"><line x1="0" y1="3" x2="24" y2="3" /></svg>value</span>
    <span class="wire node" title="Acts on a node"><svg viewBox="0 0 24 6" aria-hidden="true"><line x1="0" y1="3" x2="24" y2="3" /></svg>node</span>
    {#if never}
      <span class="wire never" data-help-name="Never fires"
        data-help="An event between two scenes: the engine builds the rules of the open scene only, so an event a rule emits in one scene never reaches another scene's rules. Plugins hear every scene."><svg viewBox="0 0 24 6" aria-hidden="true"><line x1="0" y1="3" x2="24" y2="3" /></svg>never fires</span>
    {/if}
  </div>
  {#if content.loading && !content.scenes.length}
    <p class="muted small">Loading the draft…</p>
  {:else if !view.nodes.length && !view.stubs.length}
    <p class="muted small">No logic at this level: no behaviour rules and no plugin. Add a behaviour to a node in the Inspector.</p>
  {:else if canvasError}
    <p class="danger small">The graph could not load: {canvasError}</p>
  {:else if Canvas}
    <Canvas {flow} level={levelKey} selected={selectedBox} {flash} onpick={pickBox} onenter={enterBox} />
  {:else}
    <p class="muted small">Loading the graph…</p>
  {/if}
  {#if view.problems.length}
    <ul class="problems" aria-label="Problems">
      {#each view.problems as p, i (i)}<li class="danger small">{p.message}</li>{/each}
    </ul>
  {/if}
</div>

<style>
  .logic { display: flex; flex-direction: column; gap: .375rem; min-height: 0; flex: 1; padding: .375rem .5rem .5rem; }
  .bar { display: flex; align-items: center; gap: .375rem; flex-wrap: wrap; }
  .crumbs { display: flex; align-items: center; gap: .125rem; min-width: 0; flex: 1; overflow: hidden; white-space: nowrap; }
  .crumb { border: 0; background: none; padding: 0 .25rem; height: var(--control-height); color: var(--muted); font: inherit; cursor: pointer; overflow: hidden; text-overflow: ellipsis; max-width: 12rem; }
  @media (hover: hover) {
    .crumb:hover { color: var(--text); background: var(--hover-background); }
    .hits button:hover { background: var(--hover-background); }
  }
  .crumb.current { color: var(--text); font-weight: 600; display: inline-flex; align-items: center; cursor: default; }
  .sep { color: var(--muted); }
  .search { position: relative; display: flex; align-items: center; gap: .25rem; color: var(--muted); }
  .search .field { width: 11rem; }
  .hits {
    position: absolute; z-index: 5; top: 100%; right: 0; width: 18rem; max-height: 16rem; overflow-y: auto; margin: .125rem 0 0; padding: .125rem 0;
    list-style: none; background: var(--surface); border: 1px solid var(--line);
  }
  .hits button {
    display: flex; flex-direction: column; align-items: flex-start; width: 100%; border: 0; background: none; padding: .25rem .5rem; font: inherit; color: var(--text); text-align: left; cursor: pointer;
  }
  .hits button:focus-visible { background: var(--hover-background); }
  .hit-label { font-weight: 600; }
  .hit-where { font-size: var(--text-small); color: var(--muted); }
  .none { padding: .25rem .5rem; }
  .follow { display: inline-flex; align-items: center; gap: .25rem; }
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; color: var(--muted); }
  .key { padding: 0 .375rem; border: 1px solid var(--line); }
  .key.event { border-radius: 999px; }
  .key.variable { border-style: dashed; }
  .key.node { background: var(--control-background); }
  .key.plugin { border-width: 3px; border-style: double; }
  .key.scene { border-left-width: 4px; border-color: var(--text); }
  .wire { display: inline-flex; align-items: center; gap: .1875rem; margin-left: .25rem; }
  .wire svg { width: 1.5rem; height: .375rem; }
  .wire line { stroke: var(--muted); stroke-width: 1.5; }
  .wire.value line { stroke-dasharray: 6 3; }
  .wire.node line { stroke-dasharray: 1.5 2.5; }
  .wire.never line { stroke-dasharray: 1 4; stroke-width: 1; }
  .problems { margin: 0; padding: 0 0 0 1rem; display: flex; flex-direction: column; gap: .125rem; max-height: 6rem; overflow-y: auto; }
</style>
