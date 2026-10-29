<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { content } from "$lib/content.svelte";
  import { Stage } from "$lib/stage/stage.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import StagePanel from "$lib/panels/StagePanel.svelte";
  import EntityPanel from "$lib/panels/EntityPanel.svelte";
  import TreePanel from "$lib/panels/TreePanel.svelte";
  import PublishButton from "$lib/PublishButton.svelte";

  /**
   * The workspace: the **tree** of the spread at the left (a 3D tool's outliner, collapsible to its bar), the stage
   * (the engine over the mock stage) and the panels **Stage** and **Entity** in a column at the right. On a phone the
   * panel is a sheet at the bottom whose head is the tab row (closed = the row only) and the tree is its first tab.
   */
  const bookId = $derived(page.params.book!);
  const spreadId = $derived(page.params.spread!);
  const TABS = ["tree", "stage", "entity"] as const;
  type Tab = (typeof TABS)[number];
  const TAB_KEY = "osct-editor-tab";
  const TREE_KEY = "osct-editor-tree";
  const NARROW = "(max-width: 47.9rem)";

  let container = $state<HTMLDivElement>();
  let stage = $state<Stage | null>(null);
  let tab = $state<Tab | null>((() => { try { const t = localStorage.getItem(TAB_KEY) as Tab | null; return t && TABS.includes(t) ? t : "stage"; } catch { return "stage"; } })());
  /** The tree column is open (desktop; stored) */
  let treeOpen = $state((() => { try { return localStorage.getItem(TREE_KEY) !== "closed"; } catch { return true; } })());
  /** A phone: the tree is a tab of the sheet instead of a column */
  let narrow = $state(false);
  let selectedTarget = $state<string | null>(null);
  let loadError = $state<string | null>(null);

  const setTab = (next: Tab) => {
    tab = tab === next ? null : next;
    try { if (tab) localStorage.setItem(TAB_KEY, tab); else localStorage.removeItem(TAB_KEY); } catch { /* storage blocked */ }
  };
  const setTreeOpen = (open: boolean) => {
    treeOpen = open;
    try { localStorage.setItem(TREE_KEY, open ? "open" : "closed"); } catch { /* storage blocked */ }
  };
  /** The tab the panel shows: on a desktop the tree has its own column, so a stored "tree" shows the stage */
  const shown = $derived<Tab | null>(tab === "tree" && !narrow ? "stage" : tab);
  const select = () => { if (shown !== "entity") setTab("entity"); };

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
      stage.onTap = id => {
        selectedTarget = id;
        select();
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

  const spread = $derived(content.spread(spreadId));
  const step = (direction: 1 | -1) => {
    const next = content.neighbour(spreadId, direction);
    if (next) void goto(`${base}/${bookId}/${next.id}/`, { replaceState: true });
  };
  const onKey = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
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

<svelte:window onkeydown={onKey} />

<div class="workspace" class:closed={shown === null} class:tree-closed={!treeOpen}>
  <aside class="tree">
    <div class="bar">
      {#if treeOpen}<span class="section-label grow">tree</span>{/if}
      <button type="button" class="icon-button" onclick={() => setTreeOpen(!treeOpen)} title={treeOpen ? "Hide the tree" : "Show the tree"} aria-label={treeOpen ? "Hide the tree" : "Show the tree"} aria-expanded={treeOpen}>
        <Icon name={treeOpen ? "previous" : "next"} />
      </button>
    </div>
    {#if treeOpen}
      <div class="body tree-body"><TreePanel {stage} {spreadId} bind:selected={selectedTarget} onselect={select} /></div>
    {/if}
  </aside>

  <div class="stage" bind:this={container}>
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

  <aside class="panel">
    <div class="bar">
      <a href="{base}/{bookId}/" class="icon-button" title="Back to the spreads" aria-label="Back to the spreads"><Icon name="close" /></a>
      <button type="button" class="icon-button" onclick={() => step(-1)} title="Previous spread (←)" aria-label="Previous spread"><Icon name="previous" /></button>
      <button type="button" class="icon-button" onclick={() => step(1)} title="Next spread (→)" aria-label="Next spread"><Icon name="next" /></button>
      <span class="spread-title"><span class="muted">p.</span> {spread?.title ?? spreadId}</span>
      {#if narrow}
        <button type="button" class="pill tab" class:on={shown === "tree"} aria-pressed={shown === "tree"} onclick={() => setTab("tree")}>Tree</button>
      {/if}
      <button type="button" class="pill tab" class:on={shown === "stage"} aria-pressed={shown === "stage"} onclick={() => setTab("stage")}>Stage</button>
      <button type="button" class="pill tab" class:on={shown === "entity"} aria-pressed={shown === "entity"} onclick={() => setTab("entity")}>Entity</button>
    </div>
    {#if shown === "tree"}
      <div class="body"><TreePanel {stage} {spreadId} bind:selected={selectedTarget} onselect={select} /></div>
    {:else if shown === "stage"}
      <div class="body"><StagePanel {stage} {spreadId} /></div>
    {:else if shown === "entity"}
      <div class="body"><EntityPanel {stage} {bookId} {spreadId} bind:selected={selectedTarget} {pickColour} /></div>
    {/if}
    <div class="foot">
      <PublishButton {bookId} />
    </div>
  </aside>
</div>

<style>
  .workspace { position: fixed; inset: 0; display: grid; grid-template-columns: var(--tree-width) minmax(0, 1fr) var(--panel-width); background: var(--stage-background); }
  .workspace.tree-closed { --tree-width: auto; }
  .tree { display: flex; flex-direction: column; min-height: 0; background: var(--surface); border-right: 1px solid var(--line); color: var(--text); }
  .tree .bar { padding-left: .5rem; }
  .tree-closed .tree .bar { padding-left: .375rem; }
  .tree-body { padding: .25rem .375rem .75rem; }
  .grow { flex: 1; }
  .stage { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
  .stage :global(canvas) { display: block; width: 100%; height: 100%; }
  .notice { position: absolute; left: 50%; top: 1rem; transform: translateX(-50%); margin: 0; padding: .25rem .75rem; border-radius: var(--control-radius); background: var(--surface); }
  .picker { position: absolute; inset: 0; z-index: 2; cursor: crosshair; outline: none; touch-action: none; }
  .pick-chip { position: absolute; pointer-events: none; display: inline-flex; align-items: center; gap: .375rem; height: var(--control-height); padding: 0 .5rem;
    border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); font-size: var(--text-small); font-family: ui-monospace, Consolas, monospace; }
  .pick-chip::before { content: ""; width: .875rem; height: .875rem; border-radius: 50%; border: 1px solid var(--line); background: var(--c); }
  .panel { display: flex; flex-direction: column; min-height: 0; background: var(--surface); border-left: 1px solid var(--line); color: var(--text); }
  .bar { flex: none; display: flex; align-items: center; gap: .125rem; padding: .25rem .375rem; background: var(--surface-head); border-bottom: 1px solid var(--line); }
  .bar .spread-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 .25rem; }
  .bar .tab { padding: 0 .5rem; }
  .bar .tab.on { background: var(--surface); }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: .375rem .5rem .75rem; display: flex; flex-direction: column; gap: .125rem; }
  .foot { flex: none; display: flex; justify-content: flex-end; padding: .375rem .5rem; border-top: 1px solid var(--line); }
  .icon-button { text-decoration: none; }

  /* A phone: the stage fills the screen, the panel is a sheet at the bottom (closed = the bar only) */
  @media (max-width: 47.9rem) {
    .workspace { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
    .tree { display: none; }
    .panel { max-height: 55vh; border-left: none; border-top: 1px solid var(--line); }
    .closed .panel .foot { display: none; }
    .body { padding-bottom: calc(.75rem + env(safe-area-inset-bottom)); }
  }
</style>
