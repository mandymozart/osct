<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { StepData } from "@shared/types/game-config";
  import { errorText, getTutorial, putTutorial } from "#lib/api.js";
  import { moveStep, newStep, STEP_ACTIONS, stepDraftOf, stepsData, stepsDirty, stepsProblems, stepSummary, type StepDraft, type StepText, type StepTime } from "#lib/book-texts.js";
  import { trackUnsaved } from "#lib/unsaved.js";
  import Icon from "#lib/components/Icon.svelte";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Section from "#lib/components/Section.svelte";
  import Segmented from "#lib/components/Segmented.svelte";

  /**
   * The onboarding's steps (#223) as an ordered list on the book page: each step a collapsible section (agents/DESIGN.md
   * §9) – closed, its head names what it shows and what moves it on; ↑ ↓ move it, *remove* drops it. Open: its texts,
   * illustration, button and the button's action, and the timing (a time left at the default is the app's). The whole
   * list is saved at once (`PUT …/tutorial`), *Back to the draft* drops the edits.
   */
  let { bookId }: { bookId: string } = $props();

  let saved = $state<StepData[]>([]);
  let drafts = $state<StepDraft[]>([]);
  let loaded = $state(false);
  let saving = $state(false);
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    const id = bookId;
    untrack(() => {
      loaded = false;
      getTutorial(id).then(
        ({ tutorial }) => {
          saved = tutorial;
          drafts = tutorial.map(stepDraftOf);
          loaded = true;
        },
        e => (error = errorText(e)),
      );
    });
  });

  const dirty = $derived(loaded && stepsDirty(saved, drafts));
  const problems = $derived(stepsProblems(drafts));
  onMount(() => trackUnsaved(() => dirty));

  const edit = (i: number, patch: Partial<StepDraft>) => {
    drafts = drafts.map((d, j) => (j === i ? { ...d, ...patch } : d));
    notice = null;
  };
  const save = async () => {
    saving = true;
    error = null;
    try {
      const { tutorial } = await putTutorial(bookId, stepsData(drafts));
      saved = tutorial;
      drafts = tutorial.map(stepDraftOf);
      notice = "Saved";
    } catch (e) {
      error = errorText(e);
    } finally {
      saving = false;
    }
  };

  const TEXTS: Array<{ key: StepText; label: string; help: string }> = [
    { key: "title", label: "title", help: "The step's heading. {{title}}, {{author}} and {{publisher}} are the book's." },
    { key: "description", label: "text", help: "The step's text: *emphasis*, a blank line for a new paragraph; {{title}}, {{author}} and {{publisher}} are the book's." },
    { key: "footer", label: "footer", help: "A small line near the bottom – the publisher on the splash." },
    { key: "illustration", label: "illustration", help: "A drawing above the text, as a path of the app (/assets/illustrations/…svg): it is drawn in gold." },
    { key: "button", label: "button", help: "The button's label. Without a button the step moves on by itself after its time, or on a tap." },
  ];
  const TIMES: Array<{ key: StepTime; label: string; help: string }> = [
    { key: "fadeIn", label: "fade in", help: "How long each part of the step fades in, in milliseconds." },
    { key: "stagger", label: "stagger", help: "The delay between the parts fading in one after the other (the splash: the Mark, then title, author and publisher)." },
    { key: "advance", label: "advance", help: "A step without a button moves on after this many milliseconds." },
  ];
  const ILLUSTRATIONS = ["/assets/illustrations/tutorial-step-1.svg", "/assets/illustrations/tutorial-step-2.svg"];
  const DEFAULTS: Record<StepTime, number> = { fadeIn: 600, stagger: 250, advance: 3000 };
</script>

<div class="onboarding">
  <div class="section" data-help-name="Onboarding" data-help="The steps a reader goes through on the first start, in order: the splash, the introduction, the camera permission, the way into the scan.">
    <span class="section-label">onboarding · {drafts.length} {drafts.length === 1 ? "step" : "steps"}</span>
  </div>
  {#if error && !loaded}<p class="small danger">{error}</p>{/if}
  {#if !loaded && !error}<p class="small muted">Loading…</p>{/if}
  <datalist id="onboarding-illustrations">{#each ILLUSTRATIONS as src (src)}<option value={src}></option>{/each}</datalist>
  <!-- Keyed by place: typing a step's id keeps its section open and the field focused -->
  {#each drafts as draft, i (i)}
    <Section id="onboarding.step-{i}" label="step {i + 1}" open={false} summary={stepSummary(draft)}
      help="One step of the onboarding. ↑ ↓ change its place; remove drops it from the list (Save writes the list).">
      {#snippet aside()}
        <button type="button" class="icon-button" aria-label="Move step {i + 1} up" title="Earlier" disabled={i === 0} onclick={() => (drafts = moveStep(drafts, i, -1))}><Icon name="up" /></button>
        <button type="button" class="icon-button" aria-label="Move step {i + 1} down" title="Later" disabled={i === drafts.length - 1} onclick={() => (drafts = moveStep(drafts, i, 1))}><Icon name="down" /></button>
        <button type="button" class="text-link" onclick={() => (drafts = drafts.filter((_, j) => j !== i))}>remove</button>
      {/snippet}
      <div class="row"><span class="label">id</span>
        <input class="field" value={draft.id} aria-label="Step {i + 1} id" spellcheck="false" oninput={e => edit(i, { id: e.currentTarget.value })} data-help="The step's name in the content: letters, digits, _ and -." /></div>
      {#each TEXTS as field (field.key)}
        <div class="row" class:top={field.key === "description"}><span class="label">{field.label}</span>
          {#if field.key === "description"}
            <textarea class="field text" rows="4" value={draft.description} aria-label="Step {i + 1} text" oninput={e => edit(i, { description: e.currentTarget.value })} data-help-name="Step text" data-help={field.help}></textarea>
          {:else}
            <input class="field" value={draft[field.key]} aria-label="Step {i + 1} {field.label}" placeholder="none" list={field.key === "illustration" ? "onboarding-illustrations" : undefined}
              oninput={e => edit(i, { [field.key]: e.currentTarget.value })} data-help-name="Step {field.label}" data-help={field.help} />
          {/if}
        </div>
      {/each}
      <div class="row"><span class="label">action</span>
        <span class="controls" data-help-name="Step action" data-help="What the button does: next – the next step; camera – asks for the camera, then the next step; scan – ends the onboarding in the scan.">
          <Segmented options={STEP_ACTIONS} value={draft.action} label="Step {i + 1} action" onchange={action => edit(i, { action })} />
          {#if !draft.button.trim()}<span class="small muted">with a button</span>{/if}
        </span></div>
      {#each TIMES as time (time.key)}
        {@const value = draft[time.key]}
        <div class="row" data-help-name="Step {time.label}" data-help={time.help}><span class="label">{time.label}</span>
          <span class="controls">
            {#if value === null}
              <span class="small muted">default</span>
              <button type="button" class="text-link" onclick={() => edit(i, { [time.key]: DEFAULTS[time.key] })}>set</button>
            {:else}
              <span class="w"><ScrubNumber {value} min={0} max={600000} step={50} unit="ms" label="step {i + 1} {time.label}" strict oninput={v => edit(i, { [time.key]: Math.round(v) })} /></span>
              <button type="button" class="text-link" onclick={() => edit(i, { [time.key]: null })}>default</button>
            {/if}
          </span></div>
      {/each}
    </Section>
  {/each}
  {#if loaded}
    <p><button type="button" class="pill framed" onclick={() => (drafts = [...drafts, newStep(drafts)])}><Icon name="plus" />step</button></p>
  {/if}
  {#if problems.length}<ul class="small danger problems">{#each problems as problem (problem)}<li>{problem}</li>{/each}</ul>{/if}
  <div class="actions">
    <button type="button" class="text-link" onclick={() => { drafts = saved.map(stepDraftOf); notice = null; }} disabled={!dirty || saving}>Back to the draft</button>
    <span class="grow"></span>
    {#if notice}<span class="small muted">{notice}</span>{/if}
    {#if error && loaded}<span class="small danger">{error}</span>{/if}
    <button type="button" class="pill primary" onclick={save} disabled={!dirty || saving || problems.length > 0}>{saving ? "Saving…" : "Save"}</button>
  </div>
</div>

<style>
  .onboarding { max-width: 36rem; }
  .row > .field { width: 100%; min-width: 0; }
  .row.top { align-items: start; }
  .row.top > .label { line-height: var(--control-height); }
  textarea.text { height: auto; min-height: 5rem; padding: .375rem .5rem; resize: vertical; line-height: 1.4; }
  .w { width: 8rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .problems { margin: .25rem 0 0; padding-left: 1rem; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
