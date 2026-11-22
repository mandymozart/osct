<script lang="ts">
  import { onMount, tick } from "svelte";
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import { errorText, listEnvironments, listExperiences, type ExperienceSummary, type EnvironmentUnreadable } from "#lib/api.js";
  import ExperienceCover from "#lib/ExperienceCover.svelte";
  import ExperienceSheet from "#lib/ExperienceSheet.svelte";
  import NewExperienceFlow from "#lib/NewExperienceFlow.svelte";
  import QuickAccess from "#lib/QuickAccess.svelte";
  import InfoView from "#lib/components/InfoView.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import AiConnections from "#lib/AiConnections.svelte";
  import { PAGE_MM } from "#lib/surface-edit.js";
  import { columnLabel, moveSelection } from "#lib/experiences-page.js";
  import { experiencesMenu } from "#lib/experiences-menu.svelte.js";

  /**
   * The editor's start (#153, #348 – Tilman 2026-11-22: "the right side is still smart"): **the books** on the left – each
   * experience as its cover (title, author, where it is live) with a ··· under it, and a dashed **+** card at the end –,
   * the AI connections under them (#142, #194); **a context column** on the right: nothing selected → quick access (New
   * experience, Import, Last worked on); New → the New flow step by step; a book selected (a click or its ···) → its
   * sheet (Open, Export, Replace…, Versions with make live). A click selects, a double click or Enter opens the editor;
   * the arrows move the selection, Esc clears it. The ☰ menu's *New experience…* and *Import…* open the New flow.
   */
  let experiences = $state<ExperienceSummary[] | null>(null);
  let unreadable = $state<EnvironmentUnreadable[]>([]);
  let error = $state<string | null>(null);
  let ownEnv = $state<string | null>(null);
  let selected = $state<string | null>(null);
  let column = $state<"quick" | "new" | "book">("quick");
  let newStart = $state<"empty" | "export" | null>(null);
  /** A new flow each time it is asked for (its steps start over) */
  let newRun = $state(0);
  let sheetView = $state<"sheet" | "replace">("sheet");
  let grid = $state<HTMLElement | null>(null);

  const load = async () => {
    try {
      const data = await listExperiences();
      experiences = data.experiences;
      unreadable = data.environments;
      error = null;
      if (selected && !data.experiences.some(e => e.id === selected)) select(null);
    } catch (e) {
      error = errorText(e);
    }
  };
  onMount(() => {
    void load();
    listEnvironments().then(info => (ownEnv = info.env), () => {});
  });

  const current = $derived(experiences?.find(e => e.id === selected) ?? null);
  /** What Import's Published offers: the experiences live on this instance's environment */
  const published = $derived((experiences ?? []).filter(e => (e.live ?? []).some(l => l.env === ownEnv)).map(e => ({ id: e.id, title: e.title })));
  const initialScenes = $derived(Object.fromEntries((experiences ?? []).map(e => [e.id, e.initialScene])));
  const label = $derived(columnLabel(column === "book" ? (sheetView === "replace" ? "replace" : "book") : column, current?.title));

  function select(id: string | null) {
    selected = id;
    column = id ? "book" : "quick";
    sheetView = "sheet";
  }
  const openNew = (start: "empty" | "export" | null) => {
    selected = null;
    newStart = start;
    newRun += 1;
    column = "new";
  };
  const open = (id: string) => void goto(resolve(`${id}/`));
  const focusCard = async (index: number) => {
    await tick();
    grid?.querySelectorAll<HTMLElement>("[data-card]")[index]?.focus();
  };

  // The ☰ menu asks for the New flow
  $effect(() => {
    if (!experiencesMenu.request) return;
    const kind = experiencesMenu.take();
    openNew(kind === "import" ? "export" : null);
  });

  /** The grid's columns now (the arrows ↑ ↓ move a row) */
  const columns = (): number => (grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length : 1);

  const onGridKey = (event: KeyboardEvent) => {
    if (!experiences) return;
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-card]");
    if (!card) return;
    const cards = Array.from(grid?.querySelectorAll<HTMLElement>("[data-card]") ?? []);
    const index = cards.indexOf(card);
    if (event.key === "Enter" && card.dataset.card !== "new") {
      event.preventDefault();
      open(card.dataset.card!);
      return;
    }
    const to = moveSelection(index, event.key, cards.length, columns());
    if (to === null || to === index) return;
    event.preventDefault();
    const id = cards[to].dataset.card!;
    if (id !== "new") select(id);
    void focusCard(to);
  };

  // Esc clears the selection – not while a field, a menu or a confirm has the key
  const onWindowKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented || column === "quick") return;
    const target = event.target as HTMLElement | null;
    if (target?.closest?.("input, textarea, select, [role=menu], [role=alertdialog], .compare")) return;
    select(null);
  };
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="split">
  <main class="shelf" style:--cover-ratio="{PAGE_MM.width} / {PAGE_MM.height}">
    <h1>Experiences</h1>
    {#if error}<p class="danger">{error}</p>{/if}
    {#if experiences === null && !error}
      <ul class="covers" aria-busy="true">
        {#each [0, 1] as i (i)}<li class="skeleton"><span class="cover-box"></span><span class="line"></span><span class="line short"></span></li>{/each}
      </ul>
    {:else if experiences}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <ul class="covers" bind:this={grid} onkeydown={onGridKey} aria-label="Experiences">
        {#each experiences as experience (experience.id)}
          <li class:selected={selected === experience.id}>
            <button type="button" class="experience" data-card={experience.id} aria-pressed={selected === experience.id}
              onclick={() => select(experience.id)} ondblclick={() => open(experience.id)}
              title="A click selects – its sheet opens on the right; a double click or Enter opens the editor">
              <span class="cover-box"><ExperienceCover {experience} /></span>
              <span class="title">{experience.title}</span>
              {#if experience.experience.book}<span class="author muted">{experience.experience.book.author}</span>{/if}
              <span class="live" data-help-name="Live" data-help="Where the experience is live: the environments (local, staging, production) that serve a build of it – every experience has its own store in each. Draft = no environment serves it.">
                {#each experience.live ?? [] as l (l.env)}<span class="badge on" title={l.build ? `build ${l.build}` : undefined}>{l.env}</span>{:else}<span class="badge">draft</span>{/each}
              </span>
            </button>
            <button type="button" class="icon-button more" aria-label="More: {experience.title}" title="Export, Replace, Versions"
              onclick={() => select(experience.id)}><Icon name="more" /></button>
          </li>
        {/each}
        <li class="new-card">
          <button type="button" class="experience add" data-card="new" aria-pressed={column === "new"} onclick={() => openNew(null)}
            data-help-name="New" data-help="A new experience, step by step in the column: empty, or from an export.">
            <span class="cover-box"><Icon name="plus" /></span>
            <span class="title">New</span>
          </button>
        </li>
      </ul>
      {#if experiences.length === 0}
        <p class="muted empty">No experience yet. Make one with <b>New</b>, or import one: an export file, a URL or a published version.
          <a class="text-link" href="/docs/tutorials/#bringing-in">How to bring an experience in</a></p>
      {/if}
    {/if}
    {#each unreadable as e (e.env)}
      <p class="small muted" title="An environment whose content store cannot be read – where the experiences are live there is not known">
        {e.env}: the content store cannot be read
      </p>
    {/each}
    <AiConnections />
  </main>

  <aside class="side">
    <section class="context" aria-label={label}>
      {#if column === "new"}
        <h2>New experience</h2>
        {#key newRun}
          <NewExperienceFlow existing={(experiences ?? []).map(e => e.id)} {published} start={newStart}
            ondone={async id => { await load(); open(id); }} oncancel={() => select(null)} />
        {/key}
      {:else if column === "book" && current}
        <ExperienceSheet experience={current} {ownEnv} {published} bind:view={sheetView} onopen={() => open(current.id)} onchanged={load} />
      {:else}
        <QuickAccess {initialScenes} onnew={() => openNew(null)} onimport={() => openNew("export")} />
      {/if}
    </section>
    <InfoView />
  </aside>
</div>

<style>
  .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(22rem, 30rem); height: calc(100dvh - var(--top-height)); }
  .shelf { overflow-y: auto; padding: 2rem clamp(1rem, 4vw, 3.5rem) 3rem; }
  .side { display: flex; flex-direction: column; min-height: 0; background: var(--surface-head); border-left: 1px solid var(--line); }
  .context { flex: 1; overflow-y: auto; padding: 2rem clamp(1rem, 3vw, 2rem); }
  .context > :global(*) { max-width: 28rem; }
  .context h2 { font-size: 1.125rem; font-weight: 600; margin: 0 0 1rem; }
  @media (max-width: 47.9rem) {
    .split { grid-template-columns: minmax(0, 1fr); height: auto; }
    .shelf { overflow: visible; }
    .side { border-left: none; border-top: 1px solid var(--line); }
    .side > :global(.info) { display: none; }
  }

  h1 { font-size: 1.125rem; font-weight: 600; margin: 0 0 1.5rem; }
  .empty { font-size: .875rem; max-width: 32rem; }
  .empty a { white-space: nowrap; }
  .covers { list-style: none; margin: 0 0 1.5rem; padding: 0; display: grid; gap: 2rem 1.75rem; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); }
  @media (max-width: 47.9rem) { .covers { gap: 1.5rem 1rem; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); } }
  .covers > li { display: grid; align-content: start; justify-items: start; gap: .25rem; }
  .experience { display: grid; gap: .1875rem; width: 100%; padding: 0; border: none; background: none; text-align: left; cursor: pointer; }
  .cover-box { display: block; aspect-ratio: var(--cover-ratio); margin-bottom: .5rem; overflow: hidden; background: var(--surface-head);
    box-shadow: 0 0 0 1px var(--line), 0 1px 2px rgb(0 0 0 / .06), 0 8px 20px -8px rgb(0 0 0 / .18); transition: transform .2s, box-shadow .2s; }
  .experience:focus-visible { outline: none; }
  .experience:focus-visible .cover-box { box-shadow: 0 0 0 2px var(--text), 0 2px 4px rgb(0 0 0 / .08), 0 16px 28px -10px rgb(0 0 0 / .28); }
  @media (hover: hover) {
    .experience:hover .cover-box { transform: translateY(-3px);
      box-shadow: 0 0 0 1px var(--text), 0 2px 4px rgb(0 0 0 / .08), 0 16px 28px -10px rgb(0 0 0 / .28); }
  }
  /* The selected book: outlined, monochrome (RULES #38) */
  li.selected .cover-box, .experience.add[aria-pressed="true"] .cover-box { transform: translateY(-3px); box-shadow: 0 0 0 2px var(--text), 0 2px 4px rgb(0 0 0 / .08), 0 16px 28px -10px rgb(0 0 0 / .28); }
  li.selected .title { text-decoration: underline; text-underline-offset: 3px; }
  .add .cover-box { display: grid; place-items: center; background: none; box-shadow: none; border: 1px dashed var(--muted); color: var(--muted); }
  @media (hover: hover) { .add:hover .cover-box { border-color: var(--text); color: var(--text); box-shadow: none; } }
  .experience.add[aria-pressed="true"] .cover-box { border: 1px solid var(--text); color: var(--text); box-shadow: 0 0 0 1px var(--text); }
  .add .cover-box :global(svg) { width: 2rem; height: 2rem; }
  .more { height: 1.5rem; width: 2rem; margin-left: -.375rem; color: var(--muted); }
  li.selected .more { color: var(--text); }
  .title { font-size: .875rem; font-weight: 600; line-height: 1.25; }
  .author { font-size: var(--text-size); }
  .live { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .25rem; }
  .badge { font-size: var(--text-small); line-height: 1; padding: .1875rem .375rem; border: 1px solid var(--line); color: var(--muted); }
  .badge.on { color: var(--text); border-color: var(--text); }
  .badge.on::before { content: "● "; font-size: .75em; vertical-align: .1em; }

  .skeleton .cover-box { animation: pulse 1.4s ease-in-out infinite; }
  .skeleton .line { display: block; height: .75rem; width: 70%; background: var(--surface-head); }
  .skeleton .line.short { width: 40%; }
  @keyframes pulse { 50% { opacity: .5; } }
</style>
