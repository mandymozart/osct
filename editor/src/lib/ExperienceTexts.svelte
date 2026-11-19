<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { ExperienceData } from "@shared/types/game-config";
  import { errorText, putExperience } from "#lib/api.js";
  import { autosave } from "#lib/autosave.svelte.js";
  import { baselineOf, differsFromBaseline, noteBaseline } from "#lib/baselines.js";
  import { experienceChanges, experienceDraftOf, experienceProblems, type ExperienceDraft } from "#lib/experience-texts.js";
  import { trackUnsaved } from "#lib/unsaved.js";
  import Section from "#lib/components/Section.svelte";

  /**
   * The experience's texts in the Inspector while the experience is selected (#223, #237, #320): its title, and the
   * **Printed book** it accompanies – a switch, and while it is on the book's author and publisher (the reader's splash,
   * home page and onboarding show them). An experience without a printed book (a wall, a room, an exhibition) has none.
   * Edits reach the draft by themselves a moment after the last one (#259: what changed, `PUT /editor/experiences/{id}`)
   * – the fields keep what was typed; an empty title, or an empty author while the switch is on, waits until it is
   * filled. Switching the printed book off takes two steps when the draft holds one: it removes its author and
   * publisher (`book: null`). *Undo edits* goes back to the texts the draft had before the first edit in this page.
   */
  let { experienceId, experience, onsaved }: {
    experienceId: string;
    experience: ExperienceData;
    /** The experience's texts changed in the draft */
    onsaved?: (experience: ExperienceData) => void;
  } = $props();

  let saved = $state<ExperienceData>(untrack(() => experience));
  let draft = $state<ExperienceDraft>(untrack(() => experienceDraftOf(experience)));

  const changes = $derived(experienceChanges(saved, draft));
  const dirty = $derived(Object.keys(changes).length > 0);
  const problems = $derived(experienceProblems(draft));
  // Typed, not in the draft yet (a problem keeps it back): a reload would lose it
  onMount(() => trackUnsaved(() => dirty));
  /** The texts as a subject of the autosaver and of *Undo edits* */
  const key = $derived(`experience:${experienceId}`);
  const canUndo = $derived(differsFromBaseline(key, draft));

  /** An edit: in the draft a moment after the last one – unless a problem keeps it back */
  const edit = (patch: Partial<ExperienceDraft>) => {
    const id = experienceId;
    const subject = key;
    const typed: ExperienceDraft = { ...draft, ...patch };
    noteBaseline(subject, experienceDraftOf(saved));
    draft = typed;
    const [problem] = experienceProblems(typed);
    if (problem) return autosave.hold(subject, problem);
    const done = onsaved;
    autosave.queue(subject, async () => {
      // What differs from the texts as the draft holds them when the save runs
      const fields = experienceChanges(saved, typed);
      if (!Object.keys(fields).length) return;
      const answer = await putExperience(id, fields);
      saved = answer.experience;
      done?.(answer.experience);
    });
  };

  /** The second step of switching a saved printed book off: shown until removed or kept */
  let removing = $state(false);
  let removeBusy = $state(false);
  let removeError = $state<string | null>(null);
  const switchBook = (on: boolean) => {
    removeError = null;
    if (on) {
      removing = false;
      edit({ book: true });
    } else if (saved.book) removing = true;
    else edit({ book: false, author: "", publisher: "" });
  };
  /** Removes the printed book from the draft (`book: null`) – its author and publisher go with it */
  const removeBook = async () => {
    removeBusy = true;
    removeError = null;
    noteBaseline(key, experienceDraftOf(saved));
    try {
      const answer = await putExperience(experienceId, { book: null });
      saved = answer.experience;
      draft = { ...experienceDraftOf(answer.experience), title: draft.title };
      removing = false;
      onsaved?.(answer.experience);
    } catch (e) {
      removeError = errorText(e);
    } finally {
      removeBusy = false;
    }
  };

  /** Undo edits: the texts as the draft had them before the first edit in this page – saved like any edit */
  const revert = () => {
    const before = baselineOf<ExperienceDraft>(key);
    if (before) edit(before);
  };
  const BOOK_HELP = "On: this experience accompanies a printed book – its author and publisher show on the reader's splash and home page. Off: it is no book (a wall, a room, an exhibition); switching a saved book off removes its author and publisher from the draft.";
  const bookFields: Array<{ key: "author" | "publisher"; label: string; help: string }> = [
    { key: "author", label: "author", help: "Who wrote the printed book – the reader's splash shows it." },
    { key: "publisher", label: "publisher", help: "Shown on the home page above Start and on the splash; empty: none." },
  ];
</script>

<div class="experience-texts">
  <Section id="experience.texts" label="texts" open summary={saved.title}
    help="The experience's title, as the reader's splash, home page and onboarding show it.">
    <div class="row" class:changed={"title" in changes}><span class="label">title</span>
      <input class="field" value={draft.title} aria-label="title" oninput={e => edit({ title: e.currentTarget.value })}
        data-help-name="Experience title" data-help="The experience's title – the reader's splash, home page and onboarding show it." /></div>
  </Section>
  <Section id="experience.book" label="printed book" open={!!saved.book} summary={saved.book ? [saved.book.author, saved.book.publisher].filter(Boolean).join(" · ") : "none"}
    help={BOOK_HELP} enabled={draft.book} onenabled={switchBook} enabledLabel="Printed book on or off">
    {#if draft.book}
      {#each bookFields as field (field.key)}
        <div class="row" class:changed={!!changes.book && field.key in changes.book}><span class="label">{field.label}</span>
          <input class="field" value={draft[field.key]} aria-label={field.label} placeholder={field.key === "publisher" ? "none" : ""}
            oninput={e => edit({ [field.key]: e.currentTarget.value })} data-help-name="Printed book {field.label}" data-help={field.help} /></div>
      {/each}
    {:else}
      <p class="small muted">No printed book – the reader shows no author and no publisher.</p>
    {/if}
    {#if removing}
      <div class="confirm">
        <p class="small">Remove the printed book? Its author and publisher are removed from the draft.</p>
        <span class="buttons">
          <button type="button" class="pill primary danger" disabled={removeBusy} onclick={() => void removeBook()}>{removeBusy ? "Removing…" : "Remove the printed book"}</button>
          <button type="button" class="pill" disabled={removeBusy} onclick={() => (removing = false)}>Keep it</button>
        </span>
      </div>
    {/if}
    {#if removeError}<p class="small danger">{removeError}</p>{/if}
  </Section>
  {#if problems.length}<p class="small danger">{problems.join(" ")}</p>{/if}
  <div class="actions">
    <button type="button" class="text-link" onclick={revert} disabled={!canUndo} data-help-name="Undo edits"
      data-help="Edits reach the draft by themselves, a moment after the last change. Undo edits takes the experience's texts and printed book back to how the draft had them before their first edit since this page was opened.">Undo edits</button>
  </div>
</div>

<style>
  .experience-texts { max-width: var(--panel-width); margin-bottom: .5rem; }
  .row > .field { width: 100%; min-width: 0; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .25rem; }
  .confirm { display: grid; gap: .25rem; margin: .25rem 0; }
  .buttons { display: flex; flex-wrap: wrap; gap: .5rem; }
</style>
