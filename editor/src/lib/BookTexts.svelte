<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { BookData } from "@shared/types/game-config";
  import { putBookTexts } from "#lib/api.js";
  import { autosave } from "#lib/autosave.svelte.js";
  import { baselineOf, differsFromBaseline, noteBaseline } from "#lib/baselines.js";
  import { bookChanges, bookDraftOf, bookProblems, type BookDraft } from "#lib/book-texts.js";
  import { trackUnsaved } from "#lib/unsaved.js";
  import Section from "#lib/components/Section.svelte";

  /**
   * The book's texts in the Inspector while the book is selected (#223, #237): its title, author and publisher – the
   * reader's splash, home page and onboarding show them. A collapsible section, closed naming them. Edits reach the
   * draft by themselves a moment after the last one (#259: what changed, `PUT /editor/books/{id}`) – the fields keep
   * what was typed; an empty title or author waits until it is filled. *Undo edits* goes back to the texts the draft
   * had before the first edit in this page.
   */
  let { bookId, book, onsaved }: {
    bookId: string;
    book: BookData;
    /** The book's texts changed in the draft */
    onsaved?: (book: BookData) => void;
  } = $props();

  let saved = $state<BookData>(untrack(() => book));
  let draft = $state<BookDraft>(untrack(() => bookDraftOf(book)));

  const changes = $derived(bookChanges(saved, draft));
  const dirty = $derived(Object.keys(changes).length > 0);
  const problems = $derived(bookProblems(draft));
  // Typed, not in the draft yet (a problem keeps it back): a reload would lose it
  onMount(() => trackUnsaved(() => dirty));
  /** The texts as a subject of the autosaver and of *Undo edits* */
  const key = $derived(`book:${bookId}`);
  const canUndo = $derived(differsFromBaseline(key, draft));

  /** An edit: in the draft a moment after the last one – unless a problem keeps it back */
  const edit = (patch: Partial<BookDraft>) => {
    const book = bookId;
    const subject = key;
    const typed: BookDraft = { ...draft, ...patch };
    noteBaseline(subject, bookDraftOf(saved));
    draft = typed;
    const [problem] = bookProblems(typed);
    if (problem) return autosave.hold(subject, problem);
    const done = onsaved;
    autosave.queue(subject, async () => {
      // What differs from the texts as the draft holds them when the save runs
      const fields = bookChanges(saved, typed);
      if (!Object.keys(fields).length) return;
      const answer = await putBookTexts(book, fields);
      saved = answer.book;
      done?.(answer.book);
    });
  };
  /** Undo edits: the texts as the draft had them before the first edit in this page – saved like any edit */
  const revert = () => {
    const before = baselineOf<BookDraft>(key);
    if (before) edit(before);
  };
  const fields: Array<{ key: keyof BookDraft; label: string; help: string }> = [
    { key: "title", label: "title", help: "The book's title – the reader's splash, home page and onboarding show it." },
    { key: "author", label: "author", help: "Who wrote the book – the reader's splash shows it." },
    { key: "publisher", label: "publisher", help: "Shown on the home page above Start and on the splash; empty: none." },
  ];
</script>

<div class="book-texts">
  <Section id="book.texts" label="texts" open summary={[saved.title, saved.author, saved.publisher].filter(Boolean).join(" · ")}
    help="The book's title, author and publisher, as the reader's splash and home page show them.">
    {#each fields as field (field.key)}
      <div class="row" class:changed={field.key in changes}><span class="label">{field.label}</span>
        <input class="field" value={draft[field.key]} aria-label={field.label} placeholder={field.key === "publisher" ? "none" : ""}
          oninput={e => edit({ [field.key]: e.currentTarget.value })} data-help-name="Book {field.label}" data-help={field.help} /></div>
    {/each}
    {#if problems.length}<p class="small danger">{problems.join(" ")}</p>{/if}
    <div class="actions">
      <button type="button" class="text-link" onclick={revert} disabled={!canUndo} data-help-name="Undo edits"
        data-help="Edits reach the draft by themselves, a moment after the last change. Undo edits takes the book's texts back to how the draft had them before their first edit since this page was opened.">Undo edits</button>
    </div>
  </Section>
</div>

<style>
  .book-texts { max-width: var(--panel-width); margin-bottom: .5rem; }
  .row > .field { width: 100%; min-width: 0; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .25rem; }
</style>
