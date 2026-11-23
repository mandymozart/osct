<script lang="ts">
  import { tick } from "svelte";
  import { createExperience, errorText, importExperience } from "#lib/api.js";
  import { slugCheck, slugFromTitle } from "#lib/new-experience.js";
  import { addressPreview } from "#lib/experiences-page.js";
  import ImportSource, { type LoadedSource } from "#lib/ImportSource.svelte";

  /**
   * **New experience** step by step in the Experiences workspace's Inspector (#348, #356, after #343): **1 Start** – *Empty* (one scene,
   * nothing on it: `POST /editor/experiences`) or *From an export* (a file, a URL or a published version – `ImportSource`
   * reads and previews it); **2 Name** – the title and the slug, its reader address shown whole (`<host>/<slug>/`), the
   * slug proposed from the title until the person types one, checked as the API checks it; **3 Create** – the new
   * experience, then the editor opens it. From an export the import goes to the new slug (`rename`, `create`, `title`:
   * the API's own checks, no second copy of them here). The slug never changes: once published, printed codes depend on it.
   */
  let { existing, published, start: initialStart = null, ondone, oncancel }: {
    existing: readonly string[];
    published: readonly { id: string; title: string }[];
    /** Where to begin: `export` = Import (the ☰ menu, the quick access card) */
    start?: "empty" | "export" | null;
    ondone: (experienceId: string) => void;
    oncancel: () => void;
  } = $props();

  const origin = typeof location === "undefined" ? "" : location.origin;
  // svelte-ignore state_referenced_locally
  let start = $state<"empty" | "export" | null>(initialStart);
  let step = $state<1 | 2>(1);
  let loaded = $state<LoadedSource | null>(null);
  let title = $state("");
  let titleTyped = $state(false);
  let typed = $state<string | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let titleField = $state<HTMLInputElement | null>(null);

  const slug = $derived(typed ?? slugFromTitle(title));
  const problem = $derived(title.trim() || typed !== null ? slugCheck(slug, existing) : null);
  const address = $derived(addressPreview(origin, slug));
  const canNext = $derived(start === "empty" || (start === "export" && loaded !== null));

  const next = async () => {
    if (!canNext) return;
    // From an export the title starts as the export's, until the person types one
    if (start === "export" && loaded && !titleTyped) title = loaded.preview.incoming.title;
    step = 2;
    await tick();
    titleField?.focus();
    titleField?.select();
  };

  const create = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!title.trim() || problem || !slug) return;
    busy = true;
    error = null;
    try {
      if (start === "export" && loaded) {
        const { experience } = await importExperience(slug, { ...loaded.body, rename: true, create: true, title: title.trim() });
        ondone(experience.id);
      } else {
        const { experience } = await createExperience({ id: slug, title: title.trim() });
        ondone(experience.id);
      }
    } catch (e) {
      error = errorText(e, { code: true });
    } finally {
      busy = false;
    }
  };
</script>

<div class="flow">
  <ol class="steps" aria-label="Steps">
    <li class:on={step === 1} aria-current={step === 1 ? "step" : undefined}><span>1</span> Start</li>
    <li class:on={step === 2} aria-current={step === 2 ? "step" : undefined}><span>2</span> Name</li>
    <li class:on={busy} aria-current={busy ? "step" : undefined}><span>3</span> Create</li>
  </ol>

  {#if step === 1}
    <div class="choices" role="radiogroup" aria-label="Start">
      <button type="button" class="choice" role="radio" aria-checked={start === "empty"} class:on={start === "empty"} onclick={() => (start = "empty")}
        data-help-name="Empty" data-help="A new draft with one scene (a double page) and nothing on it.">
        <b>Empty</b><span class="muted">One scene, nothing on it</span></button>
      <button type="button" class="choice" role="radio" aria-checked={start === "export"} class:on={start === "export"} onclick={() => (start = "export")}
        data-help-name="From an export" data-help="An experience's export file, a game.config.json by URL, or a version published on this instance's CDN – brought in under the new experience's own slug.">
        <b>From an export</b><span class="muted">File, URL or published</span></button>
    </div>
    {#if start === "export"}
      <ImportSource {published} onloaded={l => (loaded = l)} />
    {/if}
    <p class="actions">
      <button type="button" class="pill primary" disabled={!canNext} onclick={next}>Next</button>
      <button type="button" class="text-link" onclick={oncancel}>Cancel</button>
    </p>
  {:else}
    <form class="name" onsubmit={create}>
      <label class="stack"><span class="label">title</span>
        <input class="field" bind:this={titleField} bind:value={title} oninput={() => (titleTyped = true)} maxlength="200" required placeholder="Onion Skin & Crocodile Tears"
          data-help-name="Title" data-help="The experience's title – the reader's home screen name and splash. It can be changed later." /></label>
      <label class="stack"><span class="label">address</span>
        <input class="field slug" value={slug} oninput={e => (typed = (e.currentTarget as HTMLInputElement).value.trim().toLowerCase())}
          maxlength="64" autocomplete="off" spellcheck="false" placeholder="onion-skin" aria-invalid={problem ? "true" : undefined} aria-describedby="new-address"
          data-help-name="Slug" data-help="The experience's id and its address in the reader – https://<instance>/<slug>/ – and the folder of its content on the CDN: lower-case letters, digits and dashes, none of the site's own paths (editor, api, docs, scene, …). It can't be changed later: once the experience is published, printed QR codes and shared links depend on it." /></label>
      <p class="address" id="new-address"><code class:muted={address.placeholder || problem}>{address.text}</code></p>
      <p class="small muted">Fixed once published – printed codes depend on it.</p>
      {#if problem}<p class="danger small" role="alert">{problem}</p>{/if}
      {#if error}<p class="danger small" role="alert">{error}</p>{/if}
      <p class="actions">
        <button type="submit" class="pill primary" disabled={busy || !title.trim() || !slug || problem !== null}>{busy ? "Creating…" : "Create"}</button>
        <button type="button" class="text-link" onclick={() => (step = 1)} disabled={busy}>Back</button>
      </p>
    </form>
  {/if}
</div>

<style>
  .flow, .name { display: grid; gap: .875rem; }
  .steps { display: flex; gap: 1rem; margin: 0; padding: 0; list-style: none; color: var(--muted); font-size: var(--text-small); letter-spacing: .06em; text-transform: uppercase; }
  .steps li { display: inline-flex; align-items: center; gap: .375rem; }
  .steps span { display: inline-grid; place-items: center; width: 1.25rem; height: 1.25rem; border: 1px solid var(--line); font-variant-numeric: tabular-nums; }
  .steps li.on { color: var(--text); }
  .steps li.on span { border-color: var(--text); background: var(--text); color: var(--surface); }
  .choices { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  .choice { display: grid; gap: .25rem; justify-items: start; padding: .75rem; text-align: left; border: 1px solid var(--line); background: var(--surface); cursor: pointer; }
  @media (hover: hover) { .choice:hover { border-color: var(--muted); } }
  .choice.on { border-color: var(--text); box-shadow: inset 0 0 0 1px var(--text); }
  .choice b { font-size: .8125rem; }
  .stack { display: grid; gap: .3125rem; }
  .stack > .label { color: var(--muted); font-size: var(--text-small); letter-spacing: .06em; text-transform: uppercase; }
  .field { width: 100%; height: 2.125rem; background: var(--surface); }
  .slug, code { font-family: var(--mono, ui-monospace, monospace); }
  p { margin: 0; line-height: 1.45; }
  .address { overflow-wrap: anywhere; margin-top: -.375rem; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; margin: .25rem 0 0; }
  .actions .pill { min-height: 2.125rem; height: auto; padding: .375rem 1.25rem; }
</style>
