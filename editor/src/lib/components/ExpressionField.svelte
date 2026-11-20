<script lang="ts">
  import { untrack } from "svelte";

  /**
   * One expression typed as text (content schema 5.0, #334 – B2, B8): a rule's condition or a set's value, in monospace,
   * with its problems under it as you type (`check`: the parser's and the type checker's, in words). A value with a problem
   * is **refused** – it never reaches `onchange`, the field says it is not saved and why; the next text that checks out is
   * saved. Empty goes out as `null` (a condition: always; a set: delete). The field follows `value` when it changes from
   * elsewhere (the Logic panel, an undo) – not while what was typed is still refused.
   */
  let { value, check, onchange, label, placeholder = "", list = undefined }: {
    /** The expression's source as saved; null = empty */
    value: string | null;
    /** Its problems in words – [] when it may be saved */
    check: (source: string) => string[];
    onchange: (source: string | null) => void;
    label: string;
    placeholder?: string;
    /** A datalist's id with suggestions (the variables) */
    list?: string;
  } = $props();

  let text = $state(untrack(() => value) ?? "");
  /** The last source handed out (or shown from `value`): a new `value` from elsewhere replaces the text */
  let shown = untrack(() => value) ?? "";
  $effect(() => {
    const next = value ?? "";
    if (next !== shown) {
      shown = next;
      text = next;
    }
  });
  const problems = $derived(check(text));

  const input = (next: string) => {
    text = next;
    if (check(next).length) return;
    const source = next.trim() || null;
    if ((source ?? "") === shown.trim()) return;
    shown = source ?? "";
    onchange(source);
  };
</script>

<span class="expression">
  <input class="field code" class:bad={problems.length > 0} aria-label={label} {placeholder} {list} spellcheck="false" autocomplete="off" value={text}
    aria-invalid={problems.length > 0} oninput={e => input((e.currentTarget as HTMLInputElement).value)} />
  {#if problems.length}
    <span class="small danger problem" role="alert">not saved – {problems.join("; ")}</span>
  {/if}
</span>

<style>
  .expression { display: flex; flex-direction: column; gap: .125rem; flex: 1 1 6rem; min-width: 4rem; }
  .code { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); padding: 0 .375rem; width: 100%; }
  .bad { border-color: var(--danger, currentColor); }
  .problem { overflow-wrap: anywhere; line-height: 1.3; }
</style>
