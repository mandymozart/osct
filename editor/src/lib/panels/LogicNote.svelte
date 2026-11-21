<script lang="ts" module>
  import type { FlowNote } from "#lib/logic/flow.js";

  /** What the canvas hands a note (`LogicCanvas.svelte`) */
  export interface LogicNoteData extends Record<string, unknown> {
    note: FlowNote;
    selected: boolean;
    editable: boolean;
    /** Its new text; empty removes the note */
    onedit: (note: string, text: string) => void;
  }
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import { Handle, Position } from "@xyflow/svelte";
  import { NOTE_W } from "#lib/logic/flow.js";

  /**
   * A note on the Logic canvas (#334, schema 5.3), after the SCUTOONS deck's notes: an annotation, no logic – no ports, no
   * wires. Editor chrome, so monochrome (RULES #38 – not one of the canvas's signal colours): a square card on the head's
   * grey with a fine line, its text, and its author small and muted below. A double-click (or a new, empty note) edits the
   * text in place: Ctrl+Enter or leaving the field keeps it, Esc goes back – an empty text removes the note. The card drags
   * anywhere but the field; a note beside a box joins it by a dotted line from its anchors (`note:l`, `note:r`).
   */
  let { data }: { data: LogicNoteData } = $props();

  const note = $derived(data.note);
  let editing = $state(false);
  let draft = $state("");
  let field = $state<HTMLTextAreaElement>();

  const start = () => {
    if (!data.editable || editing) return;
    draft = note.text;
    editing = true;
  };
  // A new note is empty: it opens for typing at once
  $effect(() => {
    if (!note.text && data.editable) untrack(start);
  });
  $effect(() => {
    if (editing && field) {
      field.focus();
      field.select();
    }
  });
  const commit = () => {
    if (!editing) return;
    editing = false;
    // An empty note left empty goes too
    if (draft.trim() !== note.text || !note.text) data.onedit(note.id, draft);
  };
  const cancel = () => {
    editing = false;
    // A new note left empty goes
    if (!note.text) data.onedit(note.id, "");
  };
  const key = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };
</script>

<div class="note" class:selected={data.selected} style:width="{NOTE_W}px" role="note" aria-label="Note{note.author ? ` by ${note.author}` : ''}"
  ondblclick={e => { e.stopPropagation(); start(); }} title={data.editable && !editing ? "Double-click to edit the note" : undefined}>
  {#if editing}
    <textarea bind:this={field} class="text nodrag nowheel" bind:value={draft} rows="3" onblur={commit} onkeydown={key}
      aria-label="The note's text (Ctrl+Enter keeps it, Esc goes back, empty removes the note)" placeholder="A note…"></textarea>
  {:else}
    <p class="text">{note.text}</p>
  {/if}
  {#if note.author}<p class="author">{note.author}</p>{/if}
  <Handle type="source" position={Position.Left} id="note:l" class="note-anchor" isConnectable={false} />
  <Handle type="source" position={Position.Right} id="note:r" class="note-anchor" isConnectable={false} />
</div>

<style>
  /* Monochrome (RULES #38): the head's grey, a fine line, nearly square like the deck's notes */
  .note {
    position: relative; box-sizing: border-box; padding: .375rem .5rem; border-radius: .125rem; background: var(--surface-head);
    border: 1px solid var(--line); color: var(--text); font-size: .75rem; line-height: 1.35; cursor: grab;
  }
  .note.selected { outline: 2px solid var(--text); outline-offset: 1px; }
  .text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; min-height: 1rem; }
  textarea.text {
    display: block; width: 100%; box-sizing: border-box; resize: vertical; font: inherit; color: var(--text); background: var(--surface);
    border: 1px solid var(--line); border-radius: .125rem; padding: .125rem .25rem; cursor: text;
  }
  .author { margin: .25rem 0 0; font-size: .625rem; color: var(--muted); }
  /* The dotted line's anchor: invisible, never takes the pointer, never connects */
  .note :global(.note-anchor) { width: 1px; height: 1px; min-width: 0; min-height: 0; border: 0; background: none; opacity: 0; pointer-events: none; top: 1rem; }
</style>
