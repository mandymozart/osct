<script lang="ts">
  import { palette, type PaletteEntry } from "#lib/logic/palette.js";
  import { logicDrag, pressNodeType } from "#lib/logic-drag.svelte.js";

  /**
   * The Library's **Nodes** (#334 L-T4): the logic's node types from the registry (`logic/palette.ts`, the list the Logic
   * canvas's right-click menu reads too) – the core's families and verbs and any a plugin registered, with their owner. An
   * addable type is dragged onto the Logic canvas: there it is the same op as choosing it from the canvas's menu at that
   * point. The others say where they come from (a node from the tree, a plugin from the Code tab).
   */
  let { search = "" }: { search?: string } = $props();

  const entries = $derived(palette().filter(e => !search.trim() || `${e.label} ${e.kind} ${e.detail} ${e.owner}`.toLowerCase().includes(search.trim().toLowerCase())));
  const groups = $derived([
    { label: "Add on the Logic canvas", items: entries.filter(e => e.addable) },
    { label: "Drawn from the content", items: entries.filter(e => !e.addable) },
  ].filter(g => g.items.length));
  const word = (e: PaletteEntry) => (e.label === e.kind ? e.kind : `${e.label}`);
</script>

<div class="nodes">
  {#if logicDrag.refused}<p class="danger small">{logicDrag.refused}</p>{/if}
  {#each groups as group (group.label)}
    <div class="group-head small">{group.label} <span class="muted">{group.items.length}</span></div>
    <ul aria-label={group.label}>
      {#each group.items as entry (entry.kind)}
        <li class:addable={entry.addable} data-help-name={word(entry)} data-help={entry.detail}
          title={entry.addable ? `${entry.detail} – drag it onto the Logic canvas` : entry.detail}
          onpointerdown={e => { if (entry.addable) pressNodeType(e, entry.kind, word(entry)); }}>
          <span class="glyph {entry.family}" aria-hidden="true"></span>
          <span class="text"><span class="label">{word(entry)}</span><span class="detail">{entry.detail}</span></span>
          <span class="owner muted">{entry.owner}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted small">Nothing matches.</p>
  {/each}
</div>

<style>
  .nodes { display: flex; flex-direction: column; gap: .25rem; }
  .group-head { color: var(--muted); margin-top: .25rem; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .125rem; }
  li { display: flex; align-items: center; gap: .5rem; padding: .25rem .375rem; border: 1px solid var(--line); background: var(--surface); font-size: .75rem; touch-action: none; }
  li.addable { cursor: grab; }
  li:not(.addable) { color: var(--muted); }
  @media (hover: hover) {
    li.addable:hover { background: var(--hover-background); }
  }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.2; }
  .label { font-weight: 600; }
  .detail { font-size: .625rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .owner { font-size: .625rem; }
  /* The family by shape, as the canvas draws it (RULES #38: no colour) */
  .glyph { flex: none; width: 1rem; height: .625rem; border: 1px solid var(--text); }
  .glyph.event { border-radius: 999px; }
  .glyph.variable { border-style: dashed; }
  .glyph.entity { background: var(--control-background); border-color: var(--line); }
  .glyph.plugin { border: 3px double var(--text); }
  .glyph.scene { border-left-width: 4px; }
  .glyph.action { width: .625rem; border-radius: 0; transform: rotate(45deg) scale(.8); }
  .glyph.far { border-style: dotted; }
</style>
