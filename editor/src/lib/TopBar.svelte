<script lang="ts">
  import { untrack } from "svelte";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { describeSkipped } from "@engine/content/game-config";
  import { getExperience } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import { isAdminPath, session } from "#lib/session.svelte.js";
  import { sceneLabel } from "@engine/content/scenes";
  import PublishButton from "#lib/PublishButton.svelte";
  import ExperienceSearch from "#lib/ExperienceSearch.svelte";
  import SaveStatus from "#lib/SaveStatus.svelte";
  import { selection } from "#lib/selection.svelte.js";
  import Icon from "#lib/components/Icon.svelte";
  import ContextMenu, { type MenuItem } from "#lib/components/ContextMenu.svelte";
  import { goto } from "$app/navigation";
  import type { Point } from "#lib/context-menu.js";
  import { openFloats } from "#lib/components/floats.svelte.js";
  import { experiencesMenu } from "#lib/experiences-menu.svelte.js";

  /**
   * The editor's one top bar (every page, drawn by the layout): the breadcrumb `Experiences › experience › scene` at the left, the
   * experience's search while an experience is open (#237, `ExperienceSearch`), where the draft stands (#259, `SaveStatus`: edits save
   * themselves), Publish (with its environment), then the account menu ☰ at the right: the e-mail, Admin and Sign out
   * (Tilman, 2026-11-18). In a workspace with floating panels (#308) the **panels menu** before it: each panel that
   * closes, shown (✓) or closed – a click flips it –, and **Reset layout** (every panel back to its default place and
   * size). The experience's crumb always leads to the experience page – the scenes overview (#274); in a scene's
   * workspace the ⚙ after it selects the experience (#237): the Inspector shows its texts and settings. When the open
   * experience's draft has features this editor's engine does not know (a newer content build – RULES #10), a small warning
   * opens their list: the stage shows the experience without them.
   */
  const experienceId = $derived(page.params.experience ?? null);
  const sceneId = $derived(page.params.scene ?? null);
  const isAdminRoute = $derived(isAdminPath(page.url.pathname));

  /** Experience titles by id, read once per experience */
  const titles = $state<Record<string, string>>({});
  $effect(() => {
    const id = experienceId;
    if (!id || untrack(() => id in titles)) return;
    titles[id] = id;
    getExperience(id).then(tree => (titles[id] = tree.experience.title || id), () => {});
  });

  const scene = $derived(sceneId && content.experienceId === experienceId ? content.scene(sceneId) : undefined);
  /** The scene's full name, never cut: its label (its id when it has none) */
  const sceneCrumb = $derived(!scene ? sceneId : sceneLabel(scene));

  /** The experience's settings button in a workspace: the Inspector shows the experience */
  const selectExperience = () => selection.show({ target: null, node: [], onTarget: true, experience: true });

  /** The open experience's features the stage skips */
  const skipped = $derived(experienceId && content.experienceId === experienceId ? content.skipped : []);
  /** The account menu: opened under its button, at the right edge */
  let menuAt = $state<Point | null>(null);
  let menuButton = $state<HTMLButtonElement | null>(null);
  const openMenu = () => {
    const box = menuButton?.getBoundingClientRect();
    menuAt = box ? { x: box.right, y: box.bottom + 4 } : { x: window.innerWidth, y: 40 };
  };
  /** On the experiences page the menu also starts a new experience or an import (#348) */
  const onExperiencesPage = $derived(!experienceId && !isAdminRoute && session.isEditor);
  const menuItems = $derived<MenuItem[]>([
    ...(onExperiencesPage ? [
      { label: "New experience…", icon: "plus" as const, help: "Make a new experience step by step in the column: empty, or from an export.", select: () => experiencesMenu.ask("new") },
      { label: "Import…", icon: "download" as const, help: "Bring an experience in as a new one: an export file, a URL or a published version.", select: () => experiencesMenu.ask("import") },
    ] : []),
    ...(session.isAdmin && !isAdminRoute ? [{ label: "Admin", icon: "settings" as const, help: "The instance's users and AI connections.", select: () => void goto(resolve("admin/")) }] : []),
    // The documentation site ships with the reader at the site's root (client/public/docs/), outside the editor's base
    { label: "Documentation", icon: "info" as const, help: "How the editor works – the guide, tutorials and the API. Opens in a new tab.", select: () => void window.open("/docs/", "_blank", "noopener") },
    { label: "Sign out", icon: "open" as const, help: "Ends this session in this browser.", select: () => session.signOut() },
  ]);
  /** The panels menu: the workspace's floating panels, under its button */
  let panelsAt = $state<Point | null>(null);
  let panelsButton = $state<HTMLButtonElement | null>(null);
  const openPanels = () => {
    const box = panelsButton?.getBoundingClientRect();
    panelsAt = box ? { x: box.right, y: box.bottom + 4 } : { x: window.innerWidth, y: 40 };
  };
  const panelItems = $derived.by<MenuItem[]>(() => {
    const floats = openFloats.current;
    if (!floats) return [];
    return [
      ...floats.closable().map(p => ({
        label: p.name, icon: (p.open ? "check" : "eye-off") as "check" | "eye-off", help: p.open ? `Closes the ${p.name} panel.` : `Brings the ${p.name} panel back.`,
        select: () => floats.flip(p.id),
      })),
      { label: "Reset layout", icon: "reset" as const, help: "Every panel back to its default place and size, open or folded as it starts – the layout this browser remembered for this workspace goes.", select: () => floats.reset() },
    ];
  });
  const SKIPPED_HELP = "This experience was built with a newer content schema than this editor knows. The stage skips what it does not know – update the editor (a newer release) to see and edit everything.";
</script>

<header class="top" data-app-ui>
  <nav class="crumbs" aria-label="Breadcrumb">
    {#if session.isEditor}
      <a href={resolve("/(app)")} class="crumb" aria-current={!experienceId && !isAdminRoute ? "page" : undefined}>Experiences</a>
    {:else}
      <span class="crumb">OSCT</span>
    {/if}
    {#if experienceId}
      <span class="sep" aria-hidden="true">›</span>
      <a href={resolve(`${experienceId}/`)} class="crumb" aria-current={sceneId ? undefined : "page"}
        title={sceneId ? "Back to the experience" : undefined}>{titles[experienceId] ?? experienceId}</a>
      {#if sceneId}
        <button type="button" class="icon-button experience-settings" class:on={selection.experience} aria-pressed={selection.experience} onclick={selectExperience}
          aria-label="Experience settings" title="The experience's title, printed book and settings in the Inspector"><Icon name="settings" stroke={2} /></button>
        <span class="sep" aria-hidden="true">›</span>
        <span class="crumb current scene" aria-current="page" title={sceneCrumb}>{sceneCrumb}</span>
      {/if}
    {:else if isAdminRoute}
      <span class="sep" aria-hidden="true">›</span>
      <span class="crumb current" aria-current="page">Admin</span>
    {/if}
  </nav>
  {#if skipped.length}
    <details class="skipped">
      <summary class="small danger" data-help-name="Unknown features" data-help={SKIPPED_HELP} title={SKIPPED_HELP}>{skipped.length} unknown {skipped.length === 1 ? "feature" : "features"}</summary>
      <ul class="small" aria-label="Skipped on the stage">{#each skipped as feature (`${feature.path} ${feature.kind}`)}<li>{describeSkipped(feature)}</li>{/each}</ul>
    </details>
  {/if}
  {#if experienceId}
    {#key experienceId}<ExperienceSearch {experienceId} /><SaveStatus /><PublishButton {experienceId} />{/key}
  {/if}
  {#if openFloats.current}
    <button type="button" class="icon-button panels" bind:this={panelsButton} onclick={openPanels} aria-haspopup="menu" aria-expanded={panelsAt !== null}
      title="Panels" aria-label="Panels menu" data-help-name="Panels" data-help="The workspace's floating panels: show or close each one, and Reset layout – every panel back to its default place. Inspector and Tools only fold."><Icon name="panels" /></button>
    {#if panelsAt}<ContextMenu at={panelsAt} items={panelItems} label="Panels" head="Panels" returnFocus={panelsButton} onclose={() => (panelsAt = null)} />{/if}
  {/if}
  <button type="button" class="icon-button account" bind:this={menuButton} onclick={openMenu} aria-haspopup="menu" aria-expanded={menuAt !== null}
    title={session.user?.email ?? "Account"} aria-label="Account menu" data-help-name="Account" data-help="Your account: Admin (for admins), Documentation and Sign out."><Icon name="menu" /></button>
  {#if menuAt}<ContextMenu at={menuAt} items={menuItems} label="Account" head={session.user?.email ?? undefined} returnFocus={menuButton} onclose={() => (menuAt = null)} />{/if}
</header>

<style>
  .top { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: .75rem; height: var(--top-height); padding: 0 .75rem; background: var(--surface-head); border-bottom: 1px solid var(--line); }
  .top a { text-decoration: none; }
  /* The search gives way before the crumbs: experience and scene stay readable */
  .crumbs { flex: 1; display: flex; align-items: center; gap: .375rem; min-width: 14rem; white-space: nowrap; }
  .crumb { overflow: hidden; text-overflow: ellipsis; }
  a.crumb { color: var(--muted); }
  a.crumb[aria-current="page"], .crumb.current { color: var(--text); }
  @media (hover: hover) {
    a.crumb:hover { color: var(--text); }
  }
  .crumb[aria-current="page"] { font-weight: 600; }
  /* Short of room, Experiences gives way first: the experience's crumb is the way back to the scenes */
  .crumbs > .crumb:first-child { flex-shrink: 4; }
  .crumbs > .crumb:nth-child(3) { min-width: 3rem; }
  .experience-settings, .account, .panels { flex: none; }
  .sep { flex: none; color: var(--muted); }
  .crumb.scene { flex: none; }
  .skipped { position: relative; flex: none; }
  .skipped summary { cursor: pointer; white-space: nowrap; }
  .skipped ul { position: absolute; right: 0; top: calc(100% + .375rem); z-index: 30; width: max-content; max-width: min(32rem, calc(100vw - 1rem));
    margin: 0; padding: .5rem .75rem .5rem 1.5rem; border: 1px solid var(--line); background: var(--surface); color: var(--text); overflow-wrap: anywhere; }
  /* A full-height touch target: on a phone the experience's crumb is the way back to the scenes */
  @media (pointer: coarse) { a.crumb { line-height: var(--control-height); } }
  @media (max-width: 47.9rem) {
    .top { gap: .375rem; padding: 0 .5rem; }
    .crumbs { min-width: 6rem; }
    /* Experiences › leaves first: the experience's crumb (the way back) stays in a scene */
    .crumbs > :nth-child(-n + 2):not(:nth-last-child(-n + 3)) { display: none; }
    .crumbs { overflow: hidden; }
    .crumbs > :last-child { flex-shrink: 1; min-width: 0; }
  }
</style>
