<script lang="ts">
  import type { Asset } from "#lib/api.js";
  import { formatDuration } from "#lib/library-place.js";
  import { insideMarks, readGlbInside } from "#lib/glb-inside.js";
  import Icon from "#lib/components/Icon.svelte";
  import AssetThumb from "./AssetThumb.svelte";

  /**
   * A Library file as a tile (#330) – the panel's grid and the browser's: a square preview only (the picture contained on
   * the tile's light background, a video plays while hovered), its kind in the top left corner (a target image with the
   * target glyph), the number of uses in the top right (a dashed 0: unused), a video's duration at the bottom right; under
   * it the name on one line and one meta line. No buttons on the tile: hovered (or focused) it shows the quick actions
   * **Use** (or **Pick** while picking) · **Replace** · **⋯** as icons with a native tooltip (every action – the context menu, as a right click). A click
   * selects (`onselect`, with Shift / Ctrl for the browser's several), a double click or Enter uses (`onactivate`).
   *
   * **Stacks and levels** (#331): a stack's tile (`levels`) has two sheets offset behind it and a badge with its levels
   * (`▤ 3`, dashed `▤ 2/3` while one is missing), its quick actions add **▤** (open / close the levels, `onlevels`); a
   * level's tile in the open row names its level in the bottom right (`level`). A model file shows what it carries
   * inside – dotted `◧ map`, `◧ 2 clips` – read from the file's start (`glb-inside.ts`), only shown.
   */
  let { asset, label, kind, target = false, meta, selected = false, marked = false, useLabel = "Use", useBlocked = null, replaceable = false,
    levels = null, level = null, open = false, onselect, onactivate, onreplace, onmore, onlevels }: {
    asset: Asset;
    /** The name shown */
    label: string;
    /** The corner's kind word (`target`, `surface`, `3D`, `video` …) */
    kind: string;
    /** A target's printed image: the target glyph before the kind */
    target?: boolean;
    meta: string;
    selected?: boolean;
    /** Framed: the file chosen now for the field being picked for, or one just uploaded */
    marked?: boolean;
    useLabel?: string;
    /** Why Use cannot (the button's tooltip) – null: it can */
    useBlocked?: string | null;
    replaceable?: boolean;
    /** A stack's tile: its levels' badge (`▤ 3`), dashed while one is missing */
    levels?: { text: string; gap: boolean; title: string } | null;
    /** A level's tile: its level (`1024`, `en`) */
    level?: string | null;
    /** The stack's levels are open */
    open?: boolean;
    onselect: (keys: { shift: boolean; toggle: boolean }) => void;
    onactivate: () => void;
    onreplace?: () => void;
    onmore: (at: { x: number; y: number }) => void;
    onlevels?: () => void;
  } = $props();

  /** What a model file carries inside (◧) */
  let inside = $state<string[]>([]);
  $effect(() => {
    const url = asset.url;
    inside = [];
    if (asset.kind !== "glb") return;
    let live = true;
    void readGlbInside(url).then(found => { if (live) inside = insideMarks(found); });
    return () => { live = false; };
  });

  const own = (event: Event) => !!(event.target as Element).closest("button");
</script>

<!-- svelte-ignore a11y_click_events_have_key_events (the keys are the option's: Space selects, Enter uses) -->
<li class="tile" class:selected class:marked class:stack={!!levels} class:open role="option" aria-selected={selected} tabindex="0" title={asset.url} draggable="false"
  onclick={e => { if (!own(e)) onselect({ shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey }); }}
  ondblclick={e => { if (!own(e)) onactivate(); }}
  oncontextmenu={e => { e.preventDefault(); onmore({ x: e.clientX, y: e.clientY }); }}
  onkeydown={e => {
    if (own(e)) return;
    if (e.key === "Enter") { e.preventDefault(); onactivate(); }
    else if (e.key === " ") { e.preventDefault(); onselect({ shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey }); }
    else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onmore({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
  }}>
  <div class="pic">
    {#key asset.url}<AssetThumb {asset} square controls={false} />{/key}
    <span class="kind">{#if target}<Icon name="target" size="0.85em" stroke={2.5} />{/if}{kind}</span>
    <span class="uses" class:unused={asset.usages === 0} title={asset.usages === 0 ? "Unused – no scene, entry, environment or plugin uses it" : `${asset.usages} use${asset.usages === 1 ? "" : "s"}`}>{asset.usages}</span>
    {#if asset.durationMs}<span class="duration">{formatDuration(asset.durationMs)}</span>{/if}
    {#if levels}<span class="levels" class:gap={levels.gap} title={levels.title}>▤ {levels.text}</span>{/if}
    {#if level}<span class="level">{level}</span>{/if}
    {#if inside.length}<span class="inside" title="Inside the model file – read from it, not a file of its own">{#each inside as mark (mark)}<span>◧ {mark}</span>{/each}</span>{/if}
    <div class="quick">
      <!-- Icons with a native tooltip: the words got cut on small tiles -->
      <button type="button" class="q" disabled={!!useBlocked} aria-label="{useLabel} {label}" title={useBlocked ?? useLabel} onclick={onactivate}><Icon name="check" /></button>
      {#if onlevels}<button type="button" class="q" class:on={open} aria-label="{open ? 'Close' : 'Show'} the levels of {label}" aria-expanded={open} title={open ? "Close the levels" : "Show the levels – each one replaced alone"} onclick={onlevels}><Icon name="layers" /></button>{/if}
      {#if replaceable && onreplace}<button type="button" class="q" aria-label="Replace {label}" title="Replace – a new version, every use relinked" onclick={onreplace}><Icon name="replace" /></button>{/if}
      <button type="button" class="q more" aria-label="More actions for {label}" title="More actions"
        onclick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onmore({ x: r.left, y: r.bottom + 2 }); }}><Icon name="more" /></button>
    </div>
  </div>
  <div class="name">{label}</div>
  <div class="meta">{meta}</div>
</li>

<style>
  .tile { position: relative; display: flex; flex-direction: column; gap: .125rem; min-width: 0; outline: none; cursor: default; }
  .pic { position: relative; border: 1px solid var(--line); }
  .tile.selected .pic { outline: 2px solid var(--text); outline-offset: 1px; }
  .tile.marked .pic { border-color: var(--text); }
  .tile:focus-visible .pic { outline: 2px solid var(--muted); outline-offset: 1px; }
  .tile.selected:focus-visible .pic { outline-color: var(--text); }
  .kind, .uses, .duration { position: absolute; display: inline-flex; align-items: center; gap: .2rem; height: 1.125rem; padding: 0 .3rem; font-size: .625rem; line-height: 1; pointer-events: none; }
  .kind { top: .25rem; left: .25rem; background: var(--surface); color: var(--muted); border: 1px solid var(--line); text-transform: uppercase; letter-spacing: .04em; }
  .uses { top: .25rem; right: .25rem; min-width: 1.125rem; justify-content: center; background: var(--text); color: var(--surface); font-variant-numeric: tabular-nums; }
  .uses.unused { background: var(--surface); color: var(--muted); border: 1px dashed var(--muted); }
  .duration { bottom: .25rem; right: .25rem; background: var(--text); color: var(--surface); font-variant-numeric: tabular-nums; }
  .quick { position: absolute; left: .25rem; right: .25rem; bottom: .25rem; display: none; gap: .2rem; z-index: 1; }
  @media (hover: hover) { .tile:hover .quick { display: flex; } }
  .tile:focus-within .quick { display: flex; }
  @media (hover: hover) { .tile:hover .duration { display: none; } }
  .tile:focus-within .duration { display: none; }
  .q { flex: 0 0 1.5rem; width: 1.5rem; height: 1.5rem; padding: 0; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: inherit; font-size: var(--text-small);
    display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .q:disabled { opacity: .55; cursor: not-allowed; }
  @media (hover: hover) { .q:not(:disabled):hover { background: var(--hover-background); } }
  /* A stack (#331): two sheets offset behind the picture */
  .tile.stack .pic { box-shadow: 3px -3px 0 -1px var(--surface), 3px -3px 0 0 var(--line), 6px -6px 0 -1px var(--surface), 6px -6px 0 0 var(--line); }
  .tile.stack { margin-top: 6px; }
  .levels, .level { position: absolute; display: inline-flex; align-items: center; height: 1.125rem; padding: 0 .3rem; font-size: .625rem; line-height: 1; white-space: nowrap; font-variant-numeric: tabular-nums; pointer-events: auto; }
  .levels { bottom: .25rem; left: .25rem; background: var(--text); color: var(--surface); }
  .levels.gap { background: var(--surface); color: var(--text); border: 1px dashed var(--text); }
  .level { bottom: .25rem; right: .25rem; background: var(--text); color: var(--surface); }
  .inside { position: absolute; left: .25rem; right: .25rem; bottom: 1.6rem; display: flex; flex-wrap: wrap; gap: .2rem; pointer-events: none; }
  .inside span { font-size: .625rem; line-height: 1; padding: .15rem .25rem; border: 1px dotted var(--text); background: var(--surface); color: var(--text); white-space: nowrap; }
  @media (hover: hover) { .tile:hover .levels { display: none; } }
  .tile:focus-within .levels { display: none; }
  .q.on { background: var(--text); color: var(--surface); }
  .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { color: var(--muted); font-size: var(--text-small); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
