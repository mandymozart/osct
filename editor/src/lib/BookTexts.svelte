<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { BookData } from "@shared/types/game-config";
  import { errorText, putBookTexts } from "#lib/api.js";
  import { bookChanges, bookDraftOf, bookProblems, type BookDraft } from "#lib/book-texts.js";
  import { trackUnsaved } from "#lib/unsaved.js";
  import Section from "#lib/components/Section.svelte";

  /**
   * The book's texts on the book page (#223): its title, author and publisher – the splash and the home page show them,
   * the onboarding's `{{title}}`, `{{author}}` and `{{publisher}}` are replaced with them. A collapsible section, closed
   * naming them; Save writes what changed (`PUT /editor/books/{id}`), *Back to the draft* drops the edits.
   */
  let { bookId, book, onsaved }: {
    bookId: string;
    book: BookData;
    /** The book's texts changed in the draft */
    onsaved?: (book: BookData) => void;
  } = $props();

  let saved = $state<BookData>(untrack(() => book));
  let draft = $state<BookDraft>(untrack(() => bookDraftOf(book)));
  let saving = $state(false);
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);

  const changes = $derived(bookChanges(saved, draft));
  const dirty = $derived(Object.keys(changes).length > 0);
  const problems = $derived(bookProblems(draft));
  onMount(() => trackUnsaved(() => dirty));

  const edit = (patch: Partial<BookDraft>) => {
    draft = { ...draft, ...patch };
    notice = null;
  };
  const save = async () => {
    saving = true;
    error = null;
    try {
      const answer = await putBookTexts(bookId, changes);
      saved = answer.book;
      draft = bookDraftOf(answer.book);
      notice = "Saved";
      onsaved?.(answer.book);
    } catch (e) {
      error = errorText(e);
    } finally {
      saving = false;
    }
  };
  const fields: Array<{ key: keyof BookDraft; label: string; help: string }> = [
    { key: "title", label: "title", help: "The book's title – the splash, the home page and the onboarding's {{title}} show it." },
    { key: "author", label: "author", help: "Who wrote the book – the splash shows it ({{author}} in a step)." },
    { key: "publisher", label: "publisher", help: "Shown on the home page above Start and on the splash ({{publisher}}); empty: none." },
  ];
</script>

<div class="book-texts">
  <Section id="book.texts" label="book" open={false} summary={[saved.title, saved.author, saved.publisher].filter(Boolean).join(" · ")}
    help="The book's title, author and publisher, as the reader's splash and home page show them.">
    {#each fields as field (field.key)}
      <div class="row" class:changed={field.key in changes}><span class="label">{field.label}</span>
        <input class="field" value={draft[field.key]} aria-label={field.label} placeholder={field.key === "publisher" ? "none" : ""}
          oninput={e => edit({ [field.key]: e.currentTarget.value })} data-help-name="Book {field.label}" data-help={field.help} /></div>
    {/each}
    {#if problems.length}<p class="small danger">{problems.join(" ")}</p>{/if}
    <div class="actions">
      <button type="button" class="text-link" onclick={() => { draft = bookDraftOf(saved); notice = null; }} disabled={!dirty || saving}>Back to the draft</button>
      <span class="grow"></span>
      {#if notice}<span class="small muted">{notice}</span>{/if}
      {#if error}<span class="small danger">{error}</span>{/if}
      <button type="button" class="pill primary" onclick={save} disabled={!dirty || saving || problems.length > 0}>{saving ? "Saving…" : "Save"}</button>
    </div>
  </Section>
</div>

<style>
  .book-texts { max-width: var(--panel-width); margin-bottom: .5rem; }
  .row > .field { width: 100%; min-width: 0; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .25rem; }
  .grow { flex: 1; }
</style>
