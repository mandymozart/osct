<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { content } from "$lib/content.svelte";
  import { Stage, type PickMode, type StagePick } from "$lib/stage/stage.svelte";
  import { GIZMO_KEYS, GIZMO_MODES, type GizmoMode } from "$lib/stage/gizmo";
  import { SHADING_MODES, updatePreview, type ShadingMode } from "$lib/stage/preview";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import StagePanel from "$lib/panels/StagePanel.svelte";
  import EntityPanel from "$lib/panels/EntityPanel.svelte";
  import TreePanel from "$lib/panels/TreePanel.svelte";
  import LibraryPanel from "$lib/panels/LibraryPanel.svelte";
  import CodePanel from "$lib/panels/CodePanel.svelte";
  import EnvironmentPanel from "$lib/panels/EnvironmentPanel.svelte";
  import { environmentEdit, type EnvironmentSlot } from "$lib/environment.svelte";
  import NewTargetForm from "$lib/panels/NewTargetForm.svelte";
  import { deleteEntry, putSpread, putTarget, type Asset } from "$lib/api";
  import { library } from "$lib/library.svelte";
  import { nodeAt } from "$lib/values";

  /**
   * The workspace: the **tree** of the spread at the left (a 3D tool's outliner, collapsible to its bar), the stage
   * (the engine over the mock stage) and the panels **Stage**, **Entity**, **Environment**, **Library** and **Code** in a column at the right. On a phone the
   * panel is a sheet at the bottom whose head is the tab row (closed = the row only) and the tree is its first tab.
   * `?tab=environment` opens a tab (the book page links the Environment so).
   */
  const bookId = $derived(page.params.book!);
  const spreadId = $derived(page.params.spread!);
  const TABS = ["tree", "stage", "entity", "environment", "library", "code"] as const;
  type Tab = (typeof TABS)[number];
  const TAB_KEY = "osct-editor-tab";
  const TREE_KEY = "osct-editor-tree";
  const NARROW = "(max-width: 47.9rem)";

  let container = $state<HTMLDivElement>();
  let stage = $state<Stage | null>(null);
  let tab = $state<Tab | null>((() => {
    const asked = page.url.searchParams.get("tab") as Tab | null;
    if (asked && TABS.includes(asked)) return asked;
    try { const t = localStorage.getItem(TAB_KEY) as Tab | null; return t && TABS.includes(t) ? t : "stage"; } catch { return "stage"; }
  })());
  /** The tree column is open (desktop; stored) */
  let treeOpen = $state((() => { try { return localStorage.getItem(TREE_KEY) !== "closed"; } catch { return true; } })());
  /** A phone: the tree is a tab of the sheet instead of a column */
  let narrow = $state(false);
  let selectedTarget = $state<string | null>(null);
  /** The selected node's path in the target's entity (`[]` = the root) */
  let selectedNode = $state<number[]>([]);
  let loadError = $state<string | null>(null);

  const setTab = (next: Tab) => {
    tab = tab === next ? null : next;
    try { if (tab) localStorage.setItem(TAB_KEY, tab); else localStorage.removeItem(TAB_KEY); } catch { /* storage blocked */ }
  };
  /** Show a tab (no toggle – a panel's link to another) */
  const openTab = (next: Tab) => {
    if (tab !== next) setTab(next);
  };
  const setTreeOpen = (open: boolean) => {
    treeOpen = open;
    try { localStorage.setItem(TREE_KEY, open ? "open" : "closed"); } catch { /* storage blocked */ }
  };
  /** The tab the panel shows: on a desktop the tree has its own column, so a stored "tree" shows the stage */
  const shown = $derived<Tab | null>(tab === "tree" && !narrow ? "stage" : tab);
  const select = () => { if (shown !== "entity") setTab("entity"); };

  // ── targets: the form, removal, a changed image or placement ──
  let addingTarget = $state(false);
  let entityPanel = $state<{ useAsset: (kind: Asset["kind"], src: string, assetId: string) => void }>();
  /** The content changed under the stage (a target's image or placement, a relink): reload it and build the spread again */
  const reloadContent = async () => {
    await content.load(bookId);
    await stage?.refresh();
    void library.refresh();
  };
  const targetCreated = async (targetId: string) => {
    addingTarget = false;
    await reloadContent();
    selectedTarget = targetId;
    selectedNode = [];
    setTab("entity");
  };
  const removeTarget = async (target: { id: string; entryId: string }) => {
    if (!window.confirm(`Remove the target ${target.id} and its entry? The draft loses both (Publish makes it final).`)) return;
    await deleteEntry(bookId, target.entryId);
    if (selectedTarget === target.id) { selectedTarget = null; selectedNode = []; }
    await reloadContent();
  };
  // ── the environment: previewed on the stage while its tab is open or the Library picks a file for it ──
  $effect(() => {
    const previewing = shown === "environment" || (shown === "library" && !!environmentEdit.picking);
    stage?.previewEnvironment(previewing ? $state.snapshot(environmentEdit.edited) : null);
  });
  $effect(() => {
    if (shown !== "library" && shown !== "environment") environmentEdit.picking = null;
  });
  const pickForEnvironment = (slot: EnvironmentSlot) => {
    environmentEdit.picking = slot;
    openTab("library");
  };
  const useForEnvironment = (slot: EnvironmentSlot, asset: Asset) => {
    environmentEdit.use(slot, asset.url);
    openTab("environment");
  };

  /** The library's Use: the selected node takes the file */
  const useAsset = (asset: Asset) => {
    entityPanel?.useAsset(asset.kind, asset.url, asset.id);
    if (shown !== "entity") setTab("entity");
  };
  const useAsTargetImage = async (asset: Asset) => {
    if (!selectedTarget) return;
    await putTarget(bookId, selectedTarget, { imageSrc: asset.url });
    await reloadContent();
  };
  /** The spread's format (content schema 2.3): a double page, the front cover or the back cover – the stage follows */
  const FORMATS = ["spread", "cover", "back"] as const;
  const setFormat = async (format: (typeof FORMATS)[number]) => {
    try {
      await putSpread(bookId, spreadId, { format });
      await content.load(bookId);
      await stage?.open(spreadId);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  };
  const selectedNodeType = $derived.by(() => {
    const t = selectedTarget ? stage?.treeOf(selectedTarget) : undefined;
    return t ? (nodeAt(t, selectedNode) ?? t).type : null;
  });

  onMount(() => {
    let disposed = false;
    const media = window.matchMedia(NARROW);
    narrow = media.matches;
    const onMedia = (event: MediaQueryListEvent) => (narrow = event.matches);
    media.addEventListener("change", onMedia);
    (async () => {
      if (content.bookId !== bookId) {
        const error = await content.load(bookId);
        if (error) {
          loadError = `${error.msg}${error.details?.[0] ? ` – ${error.details[0]}` : ""}`;
          return;
        }
      }
      if (disposed || !container) return;
      stage = new Stage(container);
      stage.onPick = hit => {
        stageMenu = null;
        if (!hit) return;
        selectedTarget = hit.targetId;
        selectedNode = hit.path;
        select();
      };
      stage.onContextMenu = (hit, x, y) => {
        if (hit) {
          selectedTarget = hit.targetId;
          selectedNode = hit.path;
        }
        stageMenu = { hit, x: Math.min(x, window.innerWidth - 200), y: Math.min(y, window.innerHeight - 160) };
      };
      await stage.open(spreadId);
    })();
    return () => {
      disposed = true;
      media.removeEventListener("change", onMedia);
      void stage?.dispose();
      stage = null;
    };
  });

  // The route's spread changed (‹ › or the URL): the stage follows
  $effect(() => {
    const id = spreadId;
    if (stage && stage.spreadId !== id) void stage.open(id);
  });
  // The gizmo sits on the selected node
  $effect(() => {
    const id = selectedTarget;
    const path = selectedNode;
    stage?.selectNode(id, path);
  });
  const GIZMO_LABELS: Record<GizmoMode, string> = { translate: "Move (W)", rotate: "Rotate (E)", scale: "Scale (R)" };
  const PICK_MODES: readonly PickMode[] = ["entity", "node", "target"];
  const PICK_LABELS: Record<PickMode, string> = { entity: "Select entities – a click picks the entity (its root)", node: "Select nodes – a click picks the node under the pointer", target: "Select targets – a click picks the printed target" };
  const SHADING_LABELS: Record<ShadingMode, string> = { wireframe: "Wireframe – the entities as lines", solid: "Solid – one grey, the scene's lights", textured: "Textured – the content's materials, no sky", rendered: "Rendered – the HDRI's sky and light" };
  const SHADING_ICONS: Record<ShadingMode, IconName> = { wireframe: "shade-wire", solid: "shade-solid", textured: "shade-textured", rendered: "shade-rendered" };
  const PICK_ICONS: Record<PickMode, IconName> = { entity: "package", node: "node", target: "target" };

  // ── the stage's menu (right click): what lies there decides the actions ──
  let stageMenu = $state<{ hit: StagePick | null; x: number; y: number } | null>(null);
  const menuRemoveNode = () => {
    if (!stage || !selectedTarget) return;
    selectedNode = stage.removeNode(selectedTarget, selectedNode);
    stageMenu = null;
  };
  const menuAddNode = () => {
    stageMenu = null;
    setTab("entity");
    requestAnimationFrame(() => document.querySelector<HTMLSelectElement>('select[aria-label="New node type"]')?.focus());
  };
  const menuPlacement = () => {
    stageMenu = null;
    setTab("entity");
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("button.placement-toggle")?.click());
  };
  const GIZMO_ICONS: Record<GizmoMode, "move" | "rotate" | "scale"> = { translate: "move", rotate: "rotate", scale: "scale" };

  const spread = $derived(content.spread(spreadId));
  const step = (direction: 1 | -1) => {
    const next = content.neighbour(spreadId, direction);
    if (next) void goto(`${base}/${bookId}/${next.id}/`, { replaceState: true });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Control") stage?.setSnap(true);
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
    const mode = GIZMO_KEYS[event.key.toLowerCase()];
    if (mode && !event.ctrlKey && !event.metaKey && !event.altKey) stage?.setGizmoMode(mode);
    // Delete removes the selected node (the tree does the same when it has the focus and stops the event)
    if ((event.key === "Delete" || event.key === "Backspace") && stage && selectedTarget && stage.treeOf(selectedTarget)) {
      selectedNode = stage.removeNode(selectedTarget, selectedNode);
      event.preventDefault();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Control") stage?.setSnap(false);
  };

  // ── Pick a colour from the stage (the colour field's eyedropper): an overlay over the stage shows the colour under
  // the pointer in a chip; a tap takes it, Esc cancels. The overlay is app UI (role dialog), so the tracker ignores it.
  let picking = $state<((hex: string | null) => void) | null>(null);
  let pickHex = $state<string | null>(null);
  let pickAt = $state({ x: 0, y: 0 });
  let picker = $state<HTMLDivElement>();
  const pickColour = () => new Promise<string | null>(resolve => {
    picking = resolve;
    pickHex = null;
    requestAnimationFrame(() => picker?.focus());
  });
  const endPick = (hex: string | null) => {
    picking?.(hex);
    picking = null;
    pickHex = null;
  };
  const samplePick = (event: PointerEvent) => {
    if (!container || !stage) return;
    const rect = container.getBoundingClientRect();
    pickAt = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    pickHex = stage.sampleColor(pickAt.x, pickAt.y);
  };
</script>

<svelte:window onkeydown={onKey} onkeyup={onKeyUp} onblur={() => stage?.setSnap(false)} />

<div class="workspace" class:closed={shown === null} class:tree-closed={!treeOpen}>
  <aside class="tree" data-app-ui>
    <div class="bar">
      {#if treeOpen}<span class="section-label grow">tree</span>{/if}
      <button type="button" class="icon-button" onclick={() => setTreeOpen(!treeOpen)} title={treeOpen ? "Hide the tree" : "Show the tree"} aria-label={treeOpen ? "Hide the tree" : "Show the tree"} aria-expanded={treeOpen}>
        <Icon name={treeOpen ? "previous" : "next"} />
      </button>
    </div>
    {#if treeOpen}
      <div class="body tree-body"><TreePanel {stage} {spreadId} bind:selected={selectedTarget} bind:node={selectedNode} onselect={select} onaddtarget={() => { addingTarget = true; }} onremovetarget={removeTarget} /></div>
    {/if}
  </aside>

  <div class="stage" bind:this={container}>
    {#if stage && stage.status === "running"}
      <div class="tools" role="toolbar" data-app-ui aria-label="Transform">
        {#each GIZMO_MODES as mode (mode)}
          <button type="button" class="icon-button" class:on={stage.gizmoMode === mode} aria-pressed={stage.gizmoMode === mode} title="{GIZMO_LABELS[mode]} – Ctrl snaps" aria-label={GIZMO_LABELS[mode]}
            onclick={() => stage?.setGizmoMode(mode)}><Icon name={GIZMO_ICONS[mode]} stroke={2} /></button>
        {/each}
        <span class="tools-gap"></span>
        {#each PICK_MODES as mode (mode)}
          <button type="button" class="icon-button" class:on={stage.pickMode === mode} aria-pressed={stage.pickMode === mode} title={PICK_LABELS[mode]} aria-label={PICK_LABELS[mode]} onclick={() => stage?.setPickMode(mode)}><Icon name={PICK_ICONS[mode]} stroke={2} /></button>
        {/each}
        <span class="tools-gap"></span>
        <span class="shading" role="group" aria-label="Viewport shading">
          {#each SHADING_MODES as mode (mode)}
            <button type="button" class="icon-button" class:on={stage.shading === mode} aria-pressed={stage.shading === mode} title={SHADING_LABELS[mode]} aria-label={SHADING_LABELS[mode]} onclick={() => updatePreview({ shading: mode })}><Icon name={SHADING_ICONS[mode]} stroke={1.75} /></button>
          {/each}
        </span>
      </div>
      {#if stageMenu}
        <button type="button" class="menu-backdrop" aria-label="Close the menu" onclick={() => (stageMenu = null)} oncontextmenu={e => { e.preventDefault(); stageMenu = null; }}></button>
        <div class="menu" role="menu" data-app-ui style:left="{stageMenu.x}px" style:top="{stageMenu.y}px">
          {#if stageMenu.hit}
            {@const hit = stageMenu.hit}
            {@const hasTree = !!stage.treeOf(hit.targetId)}
            <span class="menu-head small muted">{hit.targetId}{hit.path.length ? ` › ${hit.path.join(" › ")}` : ""}</span>
            <button type="button" role="menuitem" class="menu-item" onclick={menuAddNode}>{hasTree ? "Add node…" : "Add AR content…"}</button>
            {#if hasTree}<button type="button" role="menuitem" class="menu-item" onclick={menuRemoveNode}>{hit.path.length ? "Remove node" : "Remove entity"}</button>{/if}
            <button type="button" role="menuitem" class="menu-item" onclick={menuPlacement}>Placement on the page…</button>
            <button type="button" role="menuitem" class="menu-item" onclick={() => { stageMenu = null; stage?.replayUnlock(); }}>Replay the first find</button>
            <button type="button" role="menuitem" class="menu-item" onclick={() => { stageMenu = null; setTab("library"); }}>Library…</button>
            <button type="button" role="menuitem" class="menu-item danger" onclick={() => { const t = content.spread(spreadId)?.targets.find(x => x.id === hit.targetId); stageMenu = null; if (t) void removeTarget(t); }}>Remove target</button>
          {:else}
            <span class="menu-head small muted">{spread?.title ?? spreadId}</span>
            <button type="button" role="menuitem" class="menu-item" onclick={() => { stageMenu = null; addingTarget = true; }}>+ target…</button>
            <button type="button" role="menuitem" class="menu-item" onclick={() => { stageMenu = null; stage?.replayUnlock(); }}>Replay the first find</button>
            <button type="button" role="menuitem" class="menu-item" onclick={() => { stageMenu = null; setTab("stage"); }}>Stage settings…</button>
          {/if}
        </div>
      {/if}
    {/if}
    {#if loadError}
      <p class="notice danger">{loadError}</p>
    {:else if !stage || stage.status === "idle" || stage.status === "loading" || stage.status === "starting"}
      <p class="notice muted">{content.loading ? "Loading the draft…" : "Building the stage…"}</p>
    {:else if stage.status === "error"}
      <p class="notice danger">{stage.error}</p>
    {/if}
    {#if picking}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <div bind:this={picker} class="picker" role="dialog" aria-label="Pick a colour from the stage – tap to take it, Esc to cancel" tabindex="-1"
        onpointermove={samplePick} onpointerdown={samplePick} onclick={() => endPick(pickHex)} onkeydown={e => { if (e.key === "Escape") endPick(null); }}>
        {#if pickHex}<span class="pick-chip" style:left="{pickAt.x + 16}px" style:top="{pickAt.y + 16}px" style:--c={pickHex}>{pickHex}</span>{/if}
      </div>
    {/if}
  </div>

  <aside class="panel" data-app-ui>
    <div class="bar">
      <a href="{base}/{bookId}/" class="icon-button" title="Back to the spreads" aria-label="Back to the spreads"><Icon name="close" /></a>
      <button type="button" class="icon-button" onclick={() => step(-1)} title="Previous spread (←)" aria-label="Previous spread"><Icon name="previous" /></button>
      <button type="button" class="icon-button" onclick={() => step(1)} title="Next spread (→)" aria-label="Next spread"><Icon name="next" /></button>
      <span class="grow"></span>
      {#if spread && spread.firstPage === spread.lastPage}
        <select class="field format" aria-label="Spread format" title="What this spread is: a double page, the front cover or the back cover" value={spread.format ?? "spread"}
          onchange={e => void setFormat((e.currentTarget as HTMLSelectElement).value as (typeof FORMATS)[number])}>
          {#each FORMATS as f (f)}<option value={f}>{f}</option>{/each}
        </select>
      {/if}
      {#if narrow}
        <button type="button" class="pill tab" class:on={shown === "tree"} aria-pressed={shown === "tree"} onclick={() => setTab("tree")}>Tree</button>
      {/if}
      <button type="button" class="pill tab" class:on={shown === "stage"} aria-pressed={shown === "stage"} onclick={() => setTab("stage")}>Stage</button>
      <button type="button" class="pill tab" class:on={shown === "entity"} aria-pressed={shown === "entity"} onclick={() => setTab("entity")}>Entity</button>
      <button type="button" class="pill tab" class:on={shown === "environment"} aria-pressed={shown === "environment"} title="The world around the reader and its sky, previewed on the stage" onclick={() => setTab("environment")}>Environment</button>
      <button type="button" class="pill tab" class:on={shown === "library"} aria-pressed={shown === "library"} onclick={() => setTab("library")}>Library</button>
      <button type="button" class="pill tab" class:on={shown === "code"} aria-pressed={shown === "code"} onclick={() => setTab("code")}>Code</button>
    </div>
    {#if addingTarget && spread}
      <div class="body"><NewTargetForm {bookId} {spread} {stage} oncreated={targetCreated} oncancel={() => (addingTarget = false)} /></div>
    {:else if shown === "tree"}
      <div class="body"><TreePanel {stage} {spreadId} bind:selected={selectedTarget} bind:node={selectedNode} onselect={select} onaddtarget={() => (addingTarget = true)} onremovetarget={removeTarget} /></div>
    {:else if shown === "stage"}
      <div class="body"><StagePanel {stage} {bookId} {spreadId} /></div>
    {:else if shown === "entity"}
      <div class="body"><EntityPanel bind:this={entityPanel} {stage} {bookId} {spreadId} bind:selected={selectedTarget} bind:node={selectedNode} {pickColour} onlibrary={() => setTab("library")} ontargetchanged={reloadContent} /></div>
    {:else if shown === "environment"}
      <div class="body"><EnvironmentPanel {stage} {bookId} onlibrary={pickForEnvironment} /></div>
    {:else if shown === "library"}
      <div class="body"><LibraryPanel {bookId} nodeType={selectedNodeType} targetId={selectedTarget} onuse={useAsset} onusetarget={useAsTargetImage} onchanged={reloadContent}
        environmentSlot={environmentEdit.picking} onuseenvironment={useForEnvironment} /></div>
    {:else if shown === "code"}
      <div class="body code"><CodePanel {bookId} {stage} /></div>
    {/if}
  </aside>
</div>

<style>
  .workspace { position: fixed; inset: var(--top-height) 0 0; display: grid; grid-template-columns: var(--tree-width) minmax(0, 1fr) var(--panel-width); background: var(--stage-background); }
  .workspace.tree-closed { --tree-width: auto; }
  .tree { display: flex; flex-direction: column; min-height: 0; background: var(--surface); border-right: 1px solid var(--line); color: var(--text); }
  .tree .bar { padding-left: .5rem; }
  .tree-closed .tree .bar { padding-left: .375rem; }
  .tree-body { padding: .25rem .375rem .75rem; }
  .grow { flex: 1; }
  .stage { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
  .stage :global(canvas) { display: block; width: 100%; height: 100%; }
  .notice { position: absolute; left: 50%; top: 1rem; transform: translateX(-50%); margin: 0; padding: .25rem .75rem; border-radius: var(--control-radius); background: var(--surface); }
  .tools { position: absolute; left: .5rem; top: .5rem; z-index: 1; display: flex; flex-wrap: wrap; align-items: center; gap: .125rem; max-width: calc(100% - 1rem); padding: .125rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); }
  .tools-gap { width: 1px; height: 1.25rem; margin: 0 .25rem; background: var(--line); }
  /* Blender's shading spheres sit shoulder to shoulder */
  .tools .shading { display: inline-flex; gap: 0; }
  .menu-backdrop { position: fixed; inset: 0; z-index: 9; border: none; background: none; padding: 0; cursor: default; }
  .menu { position: fixed; z-index: 10; display: flex; flex-direction: column; min-width: 11rem; padding: .25rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); }
  .menu-head { padding: .25rem .625rem; }
  .menu-item { height: var(--control-height); padding: 0 .625rem; border: none; border-radius: var(--control-radius); background: none; color: inherit; text-align: left; cursor: pointer; white-space: nowrap; }
  .menu-item:hover { background: var(--hover-background); }
  .menu-item.danger { color: var(--danger); }
  .picker { position: absolute; inset: 0; z-index: 2; cursor: crosshair; outline: none; touch-action: none; }
  .pick-chip { position: absolute; pointer-events: none; display: inline-flex; align-items: center; gap: .375rem; height: var(--control-height); padding: 0 .5rem;
    border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); font-size: var(--text-small); font-family: ui-monospace, Consolas, monospace; }
  .pick-chip::before { content: ""; width: .875rem; height: .875rem; border-radius: 50%; border: 1px solid var(--line); background: var(--c); }
  .panel { display: flex; flex-direction: column; min-height: 0; background: var(--surface); border-left: 1px solid var(--line); color: var(--text); }
  .bar { flex: none; display: flex; align-items: center; gap: .125rem; padding: .25rem .375rem; background: var(--surface-head); border-bottom: 1px solid var(--line); }
  .bar .tab { padding: 0 .5rem; }
  .bar .format { height: 1.5rem; padding: 0 .25rem; font-size: var(--text-small); }
  .bar .tab.on { background: var(--surface); }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: .375rem .5rem .75rem; display: flex; flex-direction: column; gap: .125rem; }
  .body.code { overflow: hidden; }
  .icon-button { text-decoration: none; }

  /* A phone: the stage fills the screen, the panel is a sheet at the bottom (closed = the bar only) */
  @media (max-width: 47.9rem) {
    .workspace { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
    .tree { display: none; }
    .panel { max-height: 55vh; border-left: none; border-top: 1px solid var(--line); }
    .body { padding-bottom: calc(.75rem + env(safe-area-inset-bottom)); }
  }
</style>
