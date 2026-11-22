<script lang="ts">
  import { onDestroy, onMount, type Snippet } from "svelte";
  import Icon, { type IconName } from "./Icon.svelte";
  import type { Floats, TabHeld } from "./floats.svelte.js";
  import type { Edge } from "./floats.js";
  import { dropIndex } from "./float-tabs.js";
  import { wordTabs } from "#lib/panel-tabs.js";

  /**
   * One **floating panel** over the workspace's stage (#308, after the SCUTOONS deck editor's floats): the shared
   * chrome every panel uses (RULES #32 – built once). Its head is the handle: grip, icon and name – or, in a panel of
   * tabs (#318), its tabs – dragged, it moves the panel; a double-click on it (not on a tab) or Enter on the focused
   * handle folds it to its head and opens it again; unless it is essential, the close (the top bar's panels menu brings
   * it back). Open, its edges and corners resize it. An **inline** panel (the stage toolbar) is one row – grip and icon,
   * its content, the button that turns it into one column (#315) – or that column; it never folds (an older editor's
   * fold is ignored). Where it lies is `floats` (`floats.svelte.ts`): the page lays every panel out there, this draws
   * one. A press on a panel brings it to the front.
   *
   * **Tabs** (#318, `tab` given): the head shows the panel's tabs (words, or icons in a panel too narrow for them). A tab
   * is dragged by pointer events (mouse, pen, finger): over another panel's head it lands before or after the tab under
   * the pointer – a line marks where –, over another panel's body at its end, over the stage it becomes a panel of its own
   * there. A click (or a double-click) on a tab only shows it.
   */
  let { floats, id, children, tab, extra, label, along }: {
    floats: Floats;
    id: string;
    /** The content of a panel without tabs */
    children?: Snippet;
    /** A tab's content (#318): the panel's head shows its tabs and its body the one it shows */
    tab?: Snippet<[string]>;
    /** Buttons after the tabs, for the tab shown (the Inspector's + scene) */
    extra?: Snippet<[string]>;
    /** The accessible name (the spec's name by default) */
    label?: string;
    /**
     * A content-sized toolbar whose groups do not all fit (#342): its length along (px) with every group in it – the
     * panel asks for that much, so hiding groups behind its … never shrinks the room it is given
     */
    along?: number;
  } = $props();

  const spec = $derived(floats.spec(id)!);
  const view = $derived(floats.views[id]);
  const collapsed = $derived(view?.collapsed ?? false);
  const vertical = $derived(floats.vertical(id));
  const held = $derived(floats.held?.id === id && floats.held.moved);
  const contentSized = $derived(spec.size.w === "content" || spec.size.h === "content");
  const holder = $derived(tab ? floats.arrangement[id] : undefined);
  const COARSE = "(pointer: coarse)";
  let coarse = $state(typeof window !== "undefined" && window.matchMedia(COARSE).matches);
  $effect(() => {
    const query = window.matchMedia(COARSE);
    const change = () => (coarse = query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  });
  /** The tabs as icons in a panel too narrow for their words, so its head stays one line (#172) */
  const iconTabs = $derived(!!holder && !wordTabs(view?.rect.w ?? 0, coarse, holder.tabs.length));

  onMount(() => floats.show(id));
  onDestroy(() => floats.hide(id));

  // ── the hand: pointer capture on the head or edge pressed, so the stage's frame under it takes nothing ──
  /** The last click on the head (no drag): a second one soon after at the same place folds or opens the panel */
  let lastTap: { t: number; x: number; y: number } | null = null;
  const DOUBLE_MS = 400;
  /** The pointer's later events come to the element pressed (a pointer already gone cannot be captured: the press still counts) */
  const capture = (event: PointerEvent) => {
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // released already, or not a real pointer
    }
  };
  const press = (event: PointerEvent, edge: Edge | null = null) => {
    if (event.button !== 0) return;
    // The head's buttons and tabs are their own: a press on them never moves the panel
    if (!edge && (event.target as HTMLElement).closest("button")) return;
    capture(event);
    floats.grab(id, event.clientX, event.clientY, edge);
    event.preventDefault();
  };
  const move = (event: PointerEvent) => floats.drag(event.clientX, event.clientY);
  /** Let go: a folded inline panel's icon opens on a click; a head's second click soon after folds or opens it */
  const release = (event: PointerEvent | null, open = false, head = false) => {
    const grabbed = floats.held?.id === id;
    const dragged = floats.drop();
    if (open && !dragged) floats.setCollapsed(id, false);
    if (!head || !grabbed || !event) return;
    if (dragged) {
      lastTap = null;
      return;
    }
    const now = event.timeStamp;
    if (lastTap && now - lastTap.t < DOUBLE_MS && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 8) {
      lastTap = null;
      floats.setCollapsed(id, !collapsed);
    } else lastTap = { t: now, x: event.clientX, y: event.clientY };
  };

  // Arrow keys on the focused handle move the panel (Shift: further), as a drag would; Enter folds and opens it
  const handleKey = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !spec.inline) {
      event.preventDefault();
      floats.setCollapsed(id, !collapsed);
      return;
    }
    const step = event.shiftKey ? 64 : 16;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!d || !view) return;
    event.preventDefault();
    event.stopPropagation();
    const r = view.rect;
    floats.grab(id, r.x, r.y);
    floats.drag(r.x + d[0] * 2, r.y + d[1] * 2);
    floats.drag(r.x + d[0], r.y + d[1]);
    floats.drop();
  };

  // ── a tab in the hand (#318) ──
  /** Where a tab under the pointer lands: a panel's head – before or after the tab under it –, a panel's body – at its end –, else the stage */
  const targetAt = (x: number, y: number): TabHeld["target"] => {
    const el = document.elementFromPoint(x, y);
    const head = el?.closest<HTMLElement>("[data-tab-head]");
    if (head?.dataset.tabHead) {
      const mids = [...head.querySelectorAll<HTMLElement>("[data-tab]")].map(b => {
        const r = b.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      return { panel: head.dataset.tabHead, index: dropIndex(mids, x) };
    }
    const panel = el?.closest<HTMLElement>("[data-float]")?.dataset.float;
    const h = panel ? floats.arrangement[panel] : undefined;
    return panel && h ? { panel, index: h.tabs.length } : null;
  };
  const pressTab = (event: PointerEvent, t: string) => {
    if (event.button !== 0) return;
    capture(event);
    floats.grabTab(t, id, event.clientX, event.clientY);
  };
  const moveTab = (event: PointerEvent) => {
    if (!floats.tabHeld) return;
    floats.dragTab(event.clientX, event.clientY, targetAt(event.clientX, event.clientY));
  };
  const dropTab = () => {
    floats.dropTab();
  };
  const cancelTab = () => {
    floats.tabHeld = null;
  };
  /** The marker's place in this head while a tab would land here */
  const marker = $derived.by(() => {
    const drop = floats.tabDrop;
    return drop && drop !== "out" && drop.panel === id ? drop.index : -1;
  });
  /** The tab in the hand, from this panel: drawn at the pointer */
  const ghost = $derived(floats.tabHeld?.from === id && floats.tabHeld.moved ? floats.tabHeld : null);

  const EDGES: Array<{ edge: Edge; name: string }> = [
    { edge: { x: 0, y: -1 }, name: "n" }, { edge: { x: 0, y: 1 }, name: "s" }, { edge: { x: -1, y: 0 }, name: "w" }, { edge: { x: 1, y: 0 }, name: "e" },
    { edge: { x: -1, y: -1 }, name: "nw" }, { edge: { x: 1, y: -1 }, name: "ne" }, { edge: { x: -1, y: 1 }, name: "sw" }, { edge: { x: 1, y: 1 }, name: "se" },
  ];

  // ── a content-sized panel (the toolbar) reports its content's size, the layout sizes the panel after it ──
  let content = $state<HTMLDivElement>();
  const report = (el: HTMLElement) => {
    const length = along ?? 0;
    floats.measure(id, vertical ? { w: el.offsetWidth, h: Math.max(el.scrollHeight, length) } : { w: Math.max(el.scrollWidth, length), h: el.offsetHeight });
  };
  // The toolbar's whole length changed (#342) – nothing in the panel may have changed size
  $effect(() => {
    void along;
    if (content && contentSized) report(content);
  });
  $effect(() => {
    const el = content;
    if (!el || !contentSized) return;
    const observer = new ResizeObserver(() => report(el));
    const inner = el.firstElementChild;
    if (inner) observer.observe(inner);
    observer.observe(el);
    return () => observer.disconnect();
  });
  const HANDLE_HELP = "Drag to move the panel (← ↑ → ↓ when focused, Shift for larger steps); let go near a wall or another panel and it snaps there. A double-click on the head (or Enter) folds it to its head and opens it again. Where it lies is remembered in this browser – the panels menu in the top bar resets the layout.";
  const TAB_HELP = "Drag the tab into another panel's head – it lands before or after the tab under the pointer – or out onto the stage, where it becomes a panel of its own.";
</script>

{#if view}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="float" class:inline={spec.inline} class:vertical class:collapsed class:held class:dropping={marker >= 0} aria-label={label ?? spec.name} data-app-ui data-float={id}
    style:left="{view.rect.x}px" style:top="{view.rect.y}px" style:width={spec.inline && vertical ? undefined : `${view.rect.w}px`}
    style:min-width={spec.inline && vertical ? `${view.rect.w}px` : undefined}
    style:height={spec.inline && !vertical ? undefined : `${view.rect.h}px`}
    style:min-height={spec.inline && !vertical ? `${view.rect.h}px` : undefined} style:z-index={floats.z(id) + (held ? 100 : 0)}
    onpointerdowncapture={() => floats.front(id)}>
    {#if spec.inline && collapsed}
      <button type="button" class="icon-button handle only" aria-label="{spec.name} – open" title="{spec.name} – click to open, drag to move"
        data-help-name={spec.name} data-help={spec.about}
        onpointerdown={press} onpointermove={move} onpointerup={e => release(e, true)} onpointercancel={() => release(null)} onkeydown={handleKey}>
        <Icon name={spec.icon as IconName} /></button>
    {:else if spec.inline}
      <div class="line">
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="handle" role="button" tabindex="0" aria-label="Move the {spec.name} panel" data-help-name={spec.name} data-help="{spec.about} {HANDLE_HELP}"
          onpointerdown={press} onpointermove={move} onpointerup={e => release(e)} onpointercancel={() => release(null)} onkeydown={handleKey}>
          <span class="grip"><Icon name="grip" size=".875rem" /></span>
          <Icon name={spec.icon as IconName} />
        </div>
        <div class="content" bind:this={content}>{@render children?.()}</div>
        <span class="buttons">
          <!-- A toolbar never folds: its button turns it between a row and a column (#315) -->
          <button type="button" class="icon-button" aria-pressed={vertical} onclick={() => floats.setVertical(id, !vertical)}
            aria-label={vertical ? `Lay the ${spec.name} out as a row` : `Lay the ${spec.name} out as a column`}
            title={vertical ? "As a row" : "As a column"} data-help-name="Row / column"
            data-help="Turns the toolbar between one row and one column – a column fits along the stage's left or right edge. Remembered in this browser.">
            <span class="orient" class:turned={vertical}><Icon name="orient" /></span></button>
          {#if !spec.essential}
            <button type="button" class="icon-button" onclick={() => floats.close(id)} aria-label="Close the {spec.name} panel"
              title="Close – the panels menu in the top bar brings it back"><Icon name="close" /></button>
          {/if}
        </span>
      </div>
    {:else}
      <!-- The head is the handle: a drag moves the panel, a double-click folds it (#318); its tabs and buttons are their own -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="head" data-tab-head={holder ? id : undefined}
        onpointerdown={press} onpointermove={move} onpointerup={e => release(e, false, true)} onpointercancel={() => release(null)}>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="handle" role="button" tabindex="0" aria-label="Move the {spec.name} panel – Enter folds or opens it" aria-expanded={!collapsed}
          data-help-name={spec.name} data-help="{spec.about} {HANDLE_HELP}" onkeydown={handleKey}>
          <span class="grip"><Icon name="grip" size=".875rem" /></span>
          <Icon name={spec.icon as IconName} />
          {#if !holder || collapsed}<span class="name">{spec.name}</span>{/if}
        </div>
        {#if holder && !collapsed}
          <span class="tabs" role="tablist" aria-label="{spec.name} panel tabs">
            {#each holder.tabs as t, i (t)}
              {@const ts = floats.tabSpec(t)}
              {#if marker === i}<span class="marker" aria-hidden="true"></span>{/if}
              {#if ts}
                <button type="button" role="tab" class="pill tab" class:icon-tab={iconTabs} class:on={holder.active === t} class:lifted={ghost?.tab === t}
                  aria-selected={holder.active === t} data-tab={t} aria-label={iconTabs ? ts.name : undefined} title={iconTabs ? `${ts.name} – ${ts.about}` : ts.about}
                  data-help-name={ts.name} data-help="{ts.about} {TAB_HELP}"
                  onpointerdown={e => pressTab(e, t)} onpointermove={moveTab} onpointerup={dropTab} onpointercancel={cancelTab}
                  onclick={() => floats.selectTab(id, t)}>{#if iconTabs}<Icon name={ts.icon as IconName} />{:else}{ts.name}{/if}</button>
              {/if}
            {/each}
            {#if marker === holder.tabs.length}<span class="marker" aria-hidden="true"></span>{/if}
          </span>
          {@render extra?.(holder.active)}
        {/if}
        <span class="buttons">
          {#if !spec.essential}
            <button type="button" class="icon-button" onclick={() => floats.close(id)} aria-label="Close the {spec.name} panel"
              title={holder && holder.tabs.length > 1 ? "Close the panel and its tabs – the panels menu in the top bar brings each back" : "Close – the panels menu in the top bar brings it back"}><Icon name="close" /></button>
          {/if}
        </span>
      </div>
      {#if !collapsed}
        <div class="body">{#if holder && tab}{@render tab(holder.active)}{:else}{@render children?.()}{/if}</div>
      {/if}
    {/if}
    {#if !collapsed && !(spec.inline && collapsed)}
      {#each EDGES as e (e.name)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="edge {e.name}" onpointerdown={event => press(event, e.edge)} onpointermove={move} onpointerup={() => release(null)} onpointercancel={() => release(null)}
          ondblclick={() => floats.unsize(id)} title="Drag to resize – a double-click gives it back its own size"></div>
      {/each}
    {/if}
  </section>
  {#if ghost}
    {@const ts = floats.tabSpec(ghost.tab)}
    <!-- The tab in the hand at the pointer; out on the stage it says it becomes a panel of its own -->
    <span class="ghost pill" class:out={!ghost.target} style:left="{ghost.at[0]}px" style:top="{ghost.at[1]}px" aria-hidden="true">
      {#if ts}<Icon name={ts.icon as IconName} />{ts.name}{/if}{#if !ghost.target}<span class="hint">New panel</span>{/if}</span>
  {/if}
{/if}

<style>
  .float { position: absolute; display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text);
    box-shadow: 0 .125rem .75rem rgb(0 0 0 / .12); }
  .float.held { box-shadow: 0 .25rem 1.5rem rgb(0 0 0 / .25); }
  .float.dropping { outline: 1px solid var(--text); }
  .head, .line { flex: none; display: flex; align-items: center; gap: .125rem; min-width: 0; padding: .1875rem .25rem; background: var(--surface-head); border-radius: var(--control-radius) var(--control-radius) 0 0; }
  .head { cursor: grab; touch-action: none; user-select: none; }
  .held .head { cursor: grabbing; }
  .line { background: var(--surface); border-radius: var(--control-radius); padding: .125rem; }
  /* A toolbar's handle is one button wide: the layout counts it so (`chromeOf`) */
  .line .handle { width: calc(var(--control-height) + .375rem); justify-content: center; gap: 0; padding: 0; }
  .collapsed .head { border-radius: var(--control-radius); }
  .head { border-bottom: 1px solid var(--line); }
  .collapsed .head { border-bottom: 0; }
  .handle { flex: none; display: inline-flex; align-items: center; gap: .25rem; height: var(--control-height); padding: 0 .25rem 0 0; color: var(--muted); cursor: grab; touch-action: none; user-select: none; outline: none; }
  .head .handle { flex: 0 1 auto; min-width: 0; }
  .handle:focus-visible { box-shadow: inset 0 0 0 1px var(--text); }
  .held .handle { cursor: grabbing; }
  .handle.only { width: 100%; height: 100%; padding: 0; justify-content: center; }
  .grip { display: inline-flex; width: .875rem; opacity: .7; }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-size: var(--text-small); }
  .handle .name { color: var(--text); }
  /* The tabs (#318): one line, scrolled rather than wrapped */
  .tabs { flex: 0 1 auto; min-width: 0; display: flex; align-items: center; gap: .125rem; overflow-x: auto; scrollbar-width: none; }
  .tabs .tab { flex: none; padding: 0 .375rem; touch-action: none; cursor: default; }
  .tabs .tab.on { background: var(--surface); color: var(--text); }
  .tabs .tab.icon-tab { padding: 0; width: var(--control-height); justify-content: center; }
  .tabs .tab.lifted { opacity: .4; }
  /* Where a dragged tab lands: a line between two tabs */
  .marker { flex: none; align-self: stretch; width: 2px; margin: 0 -1px; background: var(--text); border-radius: 1px; }
  .ghost { position: fixed; z-index: 10000; pointer-events: none; transform: translate(.5rem, .75rem); height: var(--control-height); border: 1px solid var(--text);
    background: var(--surface); color: var(--text); box-shadow: 0 .25rem 1rem rgb(0 0 0 / .25); }
  .ghost.out { border-style: dashed; }
  .hint { color: var(--muted); font-size: var(--text-small); }
  .buttons { flex: none; display: inline-flex; margin-left: auto; }
  /* A vertical toolbar: grip on top, its groups below each other, its button at the bottom */
  .vertical .line { flex-direction: column; }
  .vertical .line .handle { width: auto; height: calc(var(--control-height) + .375rem); }
  .vertical .buttons { margin-left: 0; margin-top: auto; }
  .vertical .content { flex: 0 1 auto; min-height: 0; }
  .orient { display: inline-flex; }
  .orient.turned { transform: rotate(90deg); }
  /* Narrower than its row (resized), the toolbar is cut, never wrapped: its natural width stays measurable (scrollWidth) */
  .content { flex: 0 1 auto; min-width: 0; overflow: hidden; }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  @media (hover: hover) {
    .handle:hover { color: var(--text); }
  }
  /* The edges' grips reach a little out of the panel, into the gap */
  .edge { position: absolute; z-index: 2; touch-action: none; }
  .n, .s { left: .5rem; right: .5rem; height: .5rem; cursor: ns-resize; }
  .n { top: -.25rem; }
  .s { bottom: -.25rem; }
  .w, .e { top: .5rem; bottom: .5rem; width: .5rem; cursor: ew-resize; }
  .w { left: -.25rem; }
  .e { right: -.25rem; }
  .nw, .ne, .sw, .se { width: .75rem; height: .75rem; }
  .nw { left: -.25rem; top: -.25rem; cursor: nwse-resize; }
  .se { right: -.25rem; bottom: -.25rem; cursor: nwse-resize; }
  .ne { right: -.25rem; top: -.25rem; cursor: nesw-resize; }
  .sw { left: -.25rem; bottom: -.25rem; cursor: nesw-resize; }
  @media (pointer: coarse) {
    .n, .s { height: 1rem; }
    .n { top: -.5rem; }
    .s { bottom: -.5rem; }
    .w, .e { width: 1rem; }
    .w { left: -.5rem; }
    .e { right: -.5rem; }
    .nw, .ne, .sw, .se { width: 1.25rem; height: 1.25rem; }
  }
</style>
