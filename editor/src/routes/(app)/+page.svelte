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
  import AiConnections, { type FreshToken } from "#lib/AiConnections.svelte";
  import Workspace from "#lib/components/Workspace.svelte";
  import { Floats } from "#lib/components/floats.svelte.js";
  import { at, type PanelSpec } from "#lib/components/floats.js";
  import type { TabSpec } from "#lib/components/float-tabs.js";
  import { PAGE_MM } from "#lib/surface-edit.js";
  import { columnLabel, moveSelection, shelfInsets } from "#lib/experiences-page.js";
  import { experiencesMenu } from "#lib/experiences-menu.svelte.js";

  /**
   * The editor's start, the **Experiences workspace** (#153, #348, #356) on the workspace shell: the stage is a plain page
   * of **the books** – each experience as its cover (title, author, where it is live) with a **Manage** button centred
   * under it, and a dashed **+** card at the end – scrolling inside the stage, no 3D; the panels float over it. Where a tall
   * panel lies along the stage's left or right side, the books keep clear of it (`shelfInsets`) while room for them is left.
   *
   * **Inspector** (the context): nothing selected → quick access (New experience, Import, Last worked on); New → the New
   * flow step by step; a book's Manage → its sheet (Open, Landing page, Export, Replace…, Versions with make live, Delete
   * experience…; Manage again closes it). Whatever asks for it (Manage, New, the ☰ menu) shows the Inspector's tab, unfolded.
   * **AI connections** (#142, #194) is a tab of the Inspector's panel; its token made here stays with the page while the tab
   * is switched (a token is shown once). **Info** as in the other workspaces. No History: there is no history across the
   * experiences but the quick access's *Last worked on*. The layout is remembered per workspace (`experiences`).
   *
   * Keyboard: Tab goes from cover to cover (the Manage buttons are no tab stops), Enter or a click opens the editor, Space
   * manages (selects) the focused book; the arrows move the focus too; an open sheet follows the focus; Esc closes the sheet.
   * The ☰ menu's *New experience…* and *Import…* open the New flow.
   */
  const TABS: TabSpec[] = [
    { id: "inspector", name: "Inspector", icon: "inspector", home: "inspector", essential: true, about: "Quick access (New experience, Import, Last worked on), the New flow, or the sheet of the book you manage. The panel holding it never closes." },
    { id: "ai", name: "AI connections", icon: "link", home: "inspector", about: "Connect an AI agent (one prompt with a fresh token) and the existing connections: renew or revoke a token." },
    { id: "info", name: "Info", icon: "info", home: "info", about: "The name and description of the control under the pointer or in focus." },
  ];
  /** The panels (rem): the Inspector along the right side, Info folded at the bottom left */
  const PANELS: PanelSpec[] = [
    { id: "inspector", name: "Inspector", icon: "inspector", about: "Quick access, the New flow or a book's sheet – and the AI connections. It folds but never closes.",
      place: at("top-right", 0, 0), size: { w: 26, h: "fill" }, min: { w: 18, h: 10 }, essential: true },
    { id: "info", name: "Info", icon: "info", about: "The name and description of the control under the pointer or in focus.",
      place: at("bottom-left", 0, 0, { collapsed: true }), size: { w: 16.5, h: 10 }, min: { w: 12, h: 5 } },
  ];
  const floats = new Floats("experiences", PANELS, TABS);

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
  /** The AI connections' state that outlives its tab being switched: which of its views, the token made here */
  let aiView = $state<"connect" | "existing">("connect");
  let aiFresh = $state<FreshToken | null>(null);
  let aiFreshShown = $state(false);

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
  /** The books keep clear of a tall panel along a side (px) */
  const insets = $derived(shelfInsets(Object.values(floats.resting), floats.area, floats.metrics.gap, 12 * floats.metrics.rem));

  /** The Inspector's tab comes to the front, its panel unfolded – what was asked for shows */
  const showInspector = () => floats.showTab("inspector", true);

  function select(id: string | null) {
    selected = id;
    column = id ? "book" : "quick";
    sheetView = "sheet";
    if (id) showInspector();
  }
  const openNew = (start: "empty" | "export" | null) => {
    selected = null;
    newStart = start;
    newRun += 1;
    column = "new";
    showInspector();
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
    if (event.key === " " && card.dataset.card !== "new") {
      event.preventDefault();
      toggle(card.dataset.card!);
      return;
    }
    const to = moveSelection(index, event.key, cards.length, columns());
    if (to === null || to === index) return;
    event.preventDefault();
    const id = cards[to].dataset.card!;
    if (id !== "new" && column === "book") select(id);
    void focusCard(to);
  };

  const toggle = (id: string) => select(selected === id ? null : id);
  /** Tab (or a click) onto another book while its sheet is open: the sheet follows */
  const onCardFocus = (id: string) => {
    if (column === "book" && selected !== id) select(id);
  };
  const onDeleted = async () => {
    select(null);
    await load();
  };

  // Esc clears the selection – not while a field, a menu or a confirm has the key
  const onWindowKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented || column === "quick") return;
    const target = event.target as HTMLElement | null;
    if (target?.closest?.("input, textarea, select, [role=menu], [role=alertdialog], .compare")) return;
    select(null);
  };

  const STAGE_HELP = "The experiences of this instance as their covers – where each is live, Manage for its sheet in the Inspector – and the + card for a new one. A click or Enter opens an experience.";
</script>

<svelte:window onkeydown={onWindowKey} />

{#snippet stageView()}
  <main class="shelf" style:--cover-ratio="{PAGE_MM.width} / {PAGE_MM.height}" style:padding-left="{insets.left}px" style:padding-right="{insets.right}px">
    <div class="books">
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
              <button type="button" class="experience" data-card={experience.id}
                onclick={() => open(experience.id)} onfocus={() => onCardFocus(experience.id)} title="Open in the editor (Enter) – Space: Manage">
                <span class="cover-box"><ExperienceCover {experience} /></span>
                <span class="title">{experience.title}</span>
                {#if experience.experience.book}<span class="author muted">{experience.experience.book.author}</span>{/if}
                <span class="live" data-help-name="Live" data-help="Where the experience is live: the environments (local, staging, production) that serve a build of it – every experience has its own store in each. Draft = no environment serves it.">
                  {#each experience.live ?? [] as l (l.env)}<span class="badge on" title={l.build ? `build ${l.build}` : undefined}>{l.env}</span>{:else}<span class="badge">draft</span>{/each}
                </span>
              </button>
              <button type="button" class="select" tabindex="-1" aria-label="Manage {experience.title}" title="Export, Replace, Versions, Delete – in the Inspector"
                aria-pressed={selected === experience.id} onclick={() => toggle(experience.id)}>Manage</button>
            </li>
          {/each}
          <li class="new-card">
            <button type="button" class="experience add" data-card="new" aria-pressed={column === "new"} onclick={() => openNew(null)}
              data-help-name="New" data-help="A new experience, step by step in the Inspector: empty, or from an export.">
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
    </div>
  </main>
{/snippet}

{#snippet tabBody(t: string)}
  {#if t === "inspector"}
    <section class="body context" aria-label={label}>
      {#if column === "new"}
        <h2>New experience</h2>
        {#key newRun}
          <NewExperienceFlow existing={(experiences ?? []).map(e => e.id)} {published} start={newStart}
            ondone={async id => { await load(); open(id); }} oncancel={() => select(null)} />
        {/key}
      {:else if column === "book" && current}
        <ExperienceSheet experience={current} {ownEnv} {published} bind:view={sheetView} onopen={() => open(current.id)} onchanged={load} ondeleted={onDeleted} />
      {:else}
        <QuickAccess {initialScenes} onnew={() => openNew(null)} onimport={() => openNew("export")} />
      {/if}
    </section>
  {:else if t === "ai"}
    <div class="body"><AiConnections bind:view={aiView} bind:fresh={aiFresh} bind:freshShown={aiFreshShown} /></div>
  {:else if t === "info"}
    <InfoView floating />
  {/if}
{/snippet}

<Workspace {floats} stage={stageView} tab={tabBody} help={{ name: "Experiences", text: STAGE_HELP }} />

<style>
  .shelf { position: absolute; inset: 0; overflow-y: auto; background: var(--surface); padding-top: 2rem; padding-bottom: calc(3rem + var(--control-height)); }
  .books { padding: 0 clamp(1rem, 4vw, 3.5rem); }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: .75rem 1rem 1rem; container: panel / inline-size; }
  .context h2 { font-size: 1.125rem; font-weight: 600; margin: 0 0 1rem; }

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
  .select { justify-self: center; margin-top: .25rem; padding: .1875rem .625rem; border: 1px solid var(--line); background: none; color: var(--muted);
    font: inherit; font-size: var(--text-small); line-height: 1.2; cursor: pointer; }
  @media (hover: hover) { .select:hover { border-color: var(--text); color: var(--text); } }
  li.selected .select { border-color: var(--text); background: var(--text); color: var(--surface); }
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
