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
  import PublishButton from "$lib/PublishButton.svelte";

  /**
   * The workspace: the stage (the engine over the mock stage) with the panels **Stage** and **Entity** – a column at
   * the right on a desktop, a sheet at the bottom on a phone whose head is the tab row (closed = the row only).
   */
  const bookId = $derived(page.params.book!);
  const spreadId = $derived(page.params.spread!);
  type Tab = "stage" | "entity";
  const TAB_KEY = "osct-editor-tab";

  let container = $state<HTMLDivElement>();
  let stage = $state<Stage | null>(null);
  let tab = $state<Tab | null>((() => { try { const t = localStorage.getItem(TAB_KEY); return t === "stage" || t === "entity" ? t : "stage"; } catch { return "stage"; } })());
  let selectedTarget = $state<string | null>(null);
  let loadError = $state<string | null>(null);

  const setTab = (next: Tab) => {
    tab = tab === next ? null : next;
    try { if (tab) localStorage.setItem(TAB_KEY, tab); else localStorage.removeItem(TAB_KEY); } catch { /* storage blocked */ }
  };

  onMount(() => {
    let disposed = false;
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
        if (tab !== "entity") setTab("entity");
      };
      await stage.open(spreadId);
    })();
    return () => {
      disposed = true;
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
</script>

<svelte:window onkeydown={onKey} />

<div class="workspace" class:closed={tab === null}>
  <div class="stage" bind:this={container}>
    {#if loadError}
      <p class="notice danger">{loadError}</p>
    {:else if !stage || stage.status === "idle" || stage.status === "loading" || stage.status === "starting"}
      <p class="notice muted">{content.loading ? "Loading the draft…" : "Building the stage…"}</p>
    {:else if stage.status === "error"}
      <p class="notice danger">{stage.error}</p>
    {/if}
  </div>

  <aside class="panel">
    <div class="bar">
      <a href="{base}/{bookId}/" class="icon-button" title="Back to the spreads" aria-label="Back to the spreads"><Icon name="close" /></a>
      <button type="button" class="icon-button" onclick={() => step(-1)} title="Previous spread (←)" aria-label="Previous spread"><Icon name="previous" /></button>
      <button type="button" class="icon-button" onclick={() => step(1)} title="Next spread (→)" aria-label="Next spread"><Icon name="next" /></button>
      <span class="spread-title"><span class="muted">p.</span> {spread?.title ?? spreadId}</span>
      <button type="button" class="pill tab" class:on={tab === "stage"} aria-pressed={tab === "stage"} onclick={() => setTab("stage")}>Stage</button>
      <button type="button" class="pill tab" class:on={tab === "entity"} aria-pressed={tab === "entity"} onclick={() => setTab("entity")}>Entity</button>
    </div>
    {#if tab === "stage"}
      <div class="body"><StagePanel {stage} {spreadId} /></div>
    {:else if tab === "entity"}
      <div class="body"><EntityPanel {stage} {bookId} {spreadId} bind:selected={selectedTarget} /></div>
    {/if}
    <div class="foot">
      <PublishButton {bookId} />
    </div>
  </aside>
</div>

<style>
  .workspace { position: fixed; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr) var(--panel-width); background: var(--stage-background); }
  .stage { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
  .stage :global(canvas) { display: block; width: 100%; height: 100%; }
  .notice { position: absolute; left: 50%; top: 1rem; transform: translateX(-50%); margin: 0; padding: .25rem .75rem; border-radius: var(--control-radius); background: var(--surface); }
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
    .panel { max-height: 55vh; border-left: none; border-top: 1px solid var(--line); }
    .closed .panel .foot { display: none; }
    .body { padding-bottom: calc(.75rem + env(safe-area-inset-bottom)); }
  }
</style>
