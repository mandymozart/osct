<script lang="ts" module>
  import type { FlowGroup } from "#lib/logic/flow.js";

  /** What the canvas hands a group's frame (`LogicCanvas.svelte`) */
  export interface LogicFrameData extends Record<string, unknown> {
    group: FlowGroup;
    /** Its size now (the members' bounds, padded – it follows them while they are dragged) */
    w: number;
    h: number;
    editable: boolean;
    onfold: (group: string, folded: boolean) => void;
    oncolour: (group: string) => void;
    /** A new label; empty removes the group */
    onrename: (group: string, label: string) => void;
  }
</script>

<script lang="ts">
  import { tick } from "svelte";
  import Icon from "#lib/components/Icon.svelte";

  /**
   * A canvas group's frame (#334 L-T7), as the SCUTOONS deck draws one (`nodes.rs`, deck-show `canvas.rs`): a dotted ground
   * in the group's colour (32 %) inside an outline (45 %, radius 0.72rem) round its boxes; its head row a fold chevron, the
   * colour's swatch (a click takes the next colour) and the label, renamed in place (empty removes the group). The head drags
   * the frame with its boxes (the canvas pins them where they are let go). It lies under the boxes and the wires.
   */
  let { data }: { data: LogicFrameData } = $props();

  const group = $derived(data.group);
  let editing = $state(false);
  let draft = $state("");
  let input = $state<HTMLInputElement>();

  const start = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!data.editable) return;
    draft = group.label;
    editing = true;
    await tick();
    input?.select();
  };
  const commit = () => {
    if (!editing) return;
    editing = false;
    if (draft.trim() !== group.label) data.onrename(group.id, draft);
  };
  const key = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") editing = false;
  };
</script>

<div class="frame" style:width="{data.w}px" style:height="{data.h}px" style:--group={group.colour} role="group" aria-label="Group {group.label}">
  <div class="frame-head" title={data.editable ? "Drag to move the group with its boxes" : group.label}>
    <button type="button" class="fold nodrag" aria-label="Fold {group.label}" aria-expanded="true" title="Fold the group to one pill"
      onclick={e => { e.stopPropagation(); data.onfold(group.id, true); }}><Icon name="down" /></button>
    <button type="button" class="swatch nodrag" aria-label="Next colour for {group.label}" title="Next colour" disabled={!data.editable}
      onclick={e => { e.stopPropagation(); data.oncolour(group.id); }}></button>
    {#if editing}
      <input bind:this={input} class="name nodrag" bind:value={draft} onblur={commit} onkeydown={key} aria-label="The group's name (empty removes the group)" />
    {:else}
      <button type="button" class="name nodrag" onclick={start} title={data.editable ? "Rename (empty removes the group)" : group.label}>{group.label}</button>
    {/if}
  </div>
</div>

<style>
  .frame {
    box-sizing: border-box; border-radius: .72rem; border: 1px solid color-mix(in srgb, var(--group) 45%, transparent);
    background-image: radial-gradient(circle, color-mix(in srgb, var(--group) 32%, transparent) 1px, transparent 1.25px);
    background-size: 1rem 1rem; background-position: .5rem .5rem; pointer-events: none;
  }
  .frame-head {
    display: flex; align-items: center; gap: .25rem; height: 2rem; padding: 0 .5rem; box-sizing: border-box; pointer-events: auto; cursor: grab; width: max-content; max-width: 100%;
  }
  .fold, .name {
    border: 0; background: none; padding: 0 .125rem; height: 1.25rem; color: var(--text); font: inherit; font-size: .75rem; cursor: pointer; display: grid; place-items: center; border-radius: .25rem;
  }
  .fold { color: var(--muted); width: 1.25rem; }
  .name { font-weight: 600; max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; text-align: left; }
  input.name { background: var(--surface); border: 1px solid var(--line); cursor: text; width: 10rem; }
  .swatch { width: .75rem; height: .75rem; padding: 0; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--group) 60%, var(--text)); background: var(--group); cursor: pointer; }
  .swatch:disabled { cursor: default; }
  @media (hover: hover) {
    .fold:hover, button.name:hover { background: var(--hover-background); color: var(--text); }
  }
</style>
