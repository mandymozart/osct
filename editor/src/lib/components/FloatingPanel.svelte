<script lang="ts">
  import { onDestroy, onMount, type Snippet } from "svelte";
  import Icon, { type IconName } from "./Icon.svelte";
  import type { Floats } from "./floats.svelte.js";
  import type { Edge } from "./floats.js";

  /**
   * One **floating panel** over the workspace's stage (#308, after the SCUTOONS deck editor's floats): the shared
   * chrome every panel uses (RULES #32 – built once). Its head is the handle: grip, icon and name (or the panel's own
   * `head`, the Inspector's tabs) – dragged, it moves the panel; then the chevron that folds it to its head and, unless it
   * is essential, the close (the top bar's panels menu brings it back). Open, its edges and corners resize it. An
   * **inline** panel (the stage toolbar) is one row: grip and icon, its content, the chevron; folded only its icon,
   * which a click opens again. Where it lies is `floats` (`floats.svelte.ts`): the page lays every panel out there,
   * this draws one. A press on a panel brings it to the front.
   */
  let { floats, id, head, children, label }: {
    floats: Floats;
    id: string;
    /** The head's middle instead of the name (the Inspector's tabs) */
    head?: Snippet;
    children: Snippet;
    /** The accessible name (the spec's name by default) */
    label?: string;
  } = $props();

  const spec = $derived(floats.spec(id)!);
  const view = $derived(floats.views[id]);
  const collapsed = $derived(view?.collapsed ?? false);
  const held = $derived(floats.held?.id === id && floats.held.moved);
  const contentSized = $derived(spec.size.w === "content" || spec.size.h === "content");

  onMount(() => floats.show(id));
  onDestroy(() => floats.hide(id));

  // ── the hand: pointer capture on the grip or edge pressed, so the stage's frame under it takes nothing ──
  const press = (event: PointerEvent, edge: Edge | null = null) => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    floats.grab(id, event.clientX, event.clientY, edge);
    event.preventDefault();
  };
  const move = (event: PointerEvent) => floats.drag(event.clientX, event.clientY);
  /** A folded inline panel's icon: a click (no drag) opens it */
  const release = (open = false) => {
    const dragged = floats.drop();
    if (open && !dragged) floats.setCollapsed(id, false);
  };

  // Arrow keys on the focused handle move the panel (Shift: further), as a drag would
  const handleKey = (event: KeyboardEvent) => {
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

  const EDGES: Array<{ edge: Edge; name: string }> = [
    { edge: { x: 0, y: -1 }, name: "n" }, { edge: { x: 0, y: 1 }, name: "s" }, { edge: { x: -1, y: 0 }, name: "w" }, { edge: { x: 1, y: 0 }, name: "e" },
    { edge: { x: -1, y: -1 }, name: "nw" }, { edge: { x: 1, y: -1 }, name: "ne" }, { edge: { x: -1, y: 1 }, name: "sw" }, { edge: { x: 1, y: 1 }, name: "se" },
  ];

  // ── a content-sized panel (the toolbar) reports its content's size, the layout sizes the panel after it ──
  let content = $state<HTMLDivElement>();
  $effect(() => {
    const el = content;
    if (!el || !contentSized) return;
    const observer = new ResizeObserver(() => floats.measure(id, { w: el.scrollWidth, h: el.offsetHeight }));
    const inner = el.firstElementChild;
    if (inner) observer.observe(inner);
    observer.observe(el);
    return () => observer.disconnect();
  });
  const HANDLE_HELP = "Drag to move the panel (← ↑ → ↓ when focused, Shift for larger steps); let go near a wall or another panel and it snaps there. Where it lies is remembered in this browser – the panels menu in the top bar resets the layout.";
</script>

{#if view}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="float" class:inline={spec.inline} class:collapsed class:held aria-label={label ?? spec.name} data-app-ui data-float={id}
    style:left="{view.rect.x}px" style:top="{view.rect.y}px" style:width="{view.rect.w}px" style:height={spec.inline && !collapsed ? undefined : `${view.rect.h}px`}
    style:min-height={spec.inline && !collapsed ? `${view.rect.h}px` : undefined} style:z-index={floats.z(id) + (held ? 100 : 0)}
    onpointerdowncapture={() => floats.front(id)}>
    {#if spec.inline && collapsed}
      <button type="button" class="icon-button handle only" aria-label="{spec.name} – open" title="{spec.name} – click to open, drag to move"
        data-help-name={spec.name} data-help={spec.about}
        onpointerdown={press} onpointermove={move} onpointerup={() => release(true)} onpointercancel={() => release()} onkeydown={handleKey}>
        <Icon name={spec.icon as IconName} /></button>
    {:else}
      <div class={spec.inline ? "line" : "head"}>
        <!-- The grip, icon and name are the handle: a drag moves the panel -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="handle" role="button" tabindex="0" aria-label="Move the {spec.name} panel" data-help-name={spec.name} data-help="{spec.about} {HANDLE_HELP}"
          onpointerdown={press} onpointermove={move} onpointerup={() => release()} onpointercancel={() => release()} onkeydown={handleKey}>
          <span class="grip"><Icon name="grip" size=".875rem" /></span>
          <Icon name={spec.icon as IconName} />
          {#if !head && !spec.inline}<span class="name">{spec.name}</span>{/if}
        </div>
        {#if spec.inline}
          <div class="content" bind:this={content}>{@render children()}</div>
        {:else if head && !collapsed}
          <div class="own-head">{@render head()}</div>
        {:else if head}
          <span class="name">{spec.name}</span>
        {/if}
        <span class="buttons">
          <button type="button" class="icon-button" aria-expanded={!collapsed} onclick={() => floats.setCollapsed(id, !collapsed)}
            aria-label={collapsed ? `Open the ${spec.name} panel` : `Fold the ${spec.name} panel`} title={collapsed ? "Open" : "Fold to its head"}>
            <Icon name={spec.inline ? "previous" : collapsed ? "down" : "up"} /></button>
          {#if !spec.essential}
            <button type="button" class="icon-button" onclick={() => floats.close(id)} aria-label="Close the {spec.name} panel"
              title="Close – the panels menu in the top bar brings it back"><Icon name="close" /></button>
          {/if}
        </span>
      </div>
      {#if !spec.inline && !collapsed}
        <div class="body">{@render children()}</div>
      {/if}
      {#if !collapsed}
        {#each EDGES as e (e.name)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="edge {e.name}" onpointerdown={event => press(event, e.edge)} onpointermove={move} onpointerup={() => release()} onpointercancel={() => release()}
            ondblclick={() => floats.unsize(id)} title="Drag to resize – a double-click gives it back its own size"></div>
        {/each}
      {/if}
    {/if}
  </section>
{/if}

<style>
  .float { position: absolute; display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text);
    box-shadow: 0 .125rem .75rem rgb(0 0 0 / .12); }
  .float.held { box-shadow: 0 .25rem 1.5rem rgb(0 0 0 / .25); }
  .head, .line { flex: none; display: flex; align-items: center; gap: .125rem; min-width: 0; padding: .1875rem .25rem; background: var(--surface-head); border-radius: var(--control-radius) var(--control-radius) 0 0; }
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
  .own-head { flex: 1; min-width: 0; display: flex; align-items: center; gap: .125rem; }
  .buttons { flex: none; display: inline-flex; margin-left: auto; }
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
