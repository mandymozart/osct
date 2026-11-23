<script lang="ts">
  import { untrack } from "svelte";
  import { page } from "$app/state";
  import type { ExperienceLanding, LandingPick } from "@shared/types/landing";
  import { errorText } from "#lib/api.js";
  import { autosave } from "#lib/autosave.svelte.js";
  import { history } from "#lib/history.svelte.js";
  import { loadDraftLanding, type DraftLanding } from "#lib/landing-draft.js";
  import { landingPickScenes, saveLandingPick } from "#lib/landing-pick.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import LandingStage from "#lib/LandingStage.svelte";
  import ScenesPanel from "#lib/ScenesPanel.svelte";
  import LandingSection from "#lib/panels/LandingSection.svelte";
  import HistoryPanel from "#lib/panels/HistoryPanel.svelte";
  import InfoView from "#lib/components/InfoView.svelte";
  import Workspace from "#lib/components/Workspace.svelte";
  import RevertPrompt from "#lib/components/RevertPrompt.svelte";
  import PluginGuardPrompt from "#lib/components/PluginGuardPrompt.svelte";
  import { Floats } from "#lib/components/floats.svelte.js";
  import { at, type PanelSpec } from "#lib/components/floats.js";
  import type { TabSpec } from "#lib/components/float-tabs.js";

  /**
   * The **landing workspace** (#356, `/editor/<experience>/landing/`) on the workspace shell: the stage is the landing
   * page a computer gets (`LandingStage` – the reader's own piece, `ui/landing`) with the experience's draft, scrolled
   * inside the stage; the panels float over it. **Inspector**: the landing's settings – the hero's pick (a scene, then
   * one of its targets with AR content), whether the stored hero is up to date, Refresh, Remove (`LandingSection`).
   * **Scenes**: the scene filmstrip of the scene workspace – a card picks the hero's scene (its first target with AR
   * content). **History** and **Info** as in a scene. A pick saves itself (RULES #37) and the stage follows: the draft is
   * read again after every landing save and every revert. The layout is remembered per workspace (`landing`).
   */
  const experienceId = $derived(page.params.experience!);

  const LANDING_TABS: TabSpec[] = [
    { id: "inspector", name: "Inspector", icon: "inspector", home: "inspector", essential: true, about: "The landing page's settings: the hero's scene and target, whether its stored hero is up to date. The panel holding it never closes." },
    { id: "scenes", name: "Scenes", icon: "film", home: "scenes", about: "The experience's scenes as a filmstrip: a card picks the hero's scene – its first target with AR content." },
    { id: "info", name: "Info", icon: "info", home: "info", about: "The name and description of the control under the pointer or in focus." },
    { id: "history", name: "History", icon: "history", home: "history", about: "Every saved change of the experience: filter by scene, kind or person; revert one, or jump back to a point (#312)." },
  ];
  /** The panels (rem), in the order of growth: the Inspector takes the full height beside the Scenes strip */
  const LANDING_PANELS: PanelSpec[] = [
    { id: "inspector", name: "Inspector", icon: "inspector", about: "The landing page's settings. It folds but never closes.",
      place: at("top-right", 0, 0), size: { w: 22, h: "fill" }, min: { w: 16, h: 8 }, essential: true },
    { id: "scenes", name: "Scenes", icon: "film", about: "The experience's scenes as a filmstrip: a card picks the hero's scene.",
      place: at("bottom-left", 17, 0), size: { w: "fill", h: 12 }, min: { w: 20, h: 10 } },
    { id: "info", name: "Info", icon: "info", about: "The name and description of the control under the pointer or in focus.",
      place: at("bottom-left", 0, 0, { collapsed: true }), size: { w: 16.5, h: 10 }, min: { w: 12, h: 5 } },
    { id: "history", name: "History", icon: "history", about: "Every saved change of the experience: filter by scene, kind or person; revert one, or jump back to a point (#312).",
      place: at("bottom-right", 0, 0, { closed: true }), size: { w: 28, h: 20 }, min: { w: 16, h: 8 } },
  ];
  const floats = new Floats("landing", LANDING_PANELS, LANDING_TABS);

  /** The draft as the landing shows it; null while it is read */
  let draft = $state<DraftLanding | null>(null);
  let loadError = $state<string | null>(null);
  /** Counts the reasons to read the draft again: a landing save, a revert */
  let reload = $state(0);
  /** The pick as the draft holds it – the Inspector's selects and the Scenes panel's card share it */
  let landing = $state<ExperienceLanding | null>(null);
  /** A pick is being saved: the Inspector says so, the stage keeps the last page until the draft holds it */
  let saving = $state(false);
  let notice = $state<string | null>(null);

  $effect(() => {
    const id = experienceId;
    void reload;
    let gone = false;
    loadError = null;
    loadDraftLanding(id).then(result => {
      if (gone) return;
      draft = result;
      if (!untrack(() => saving)) landing = result.configuration.experience.landing ?? null;
    }, e => { if (!gone) loadError = errorText(e); });
    return () => { gone = true; };
  });
  $effect(() => {
    const id = experienceId;
    untrack(() => {
      if (scenes.experienceId !== id) void scenes.load(id);
      history.enter(id);
    });
  });
  // A revert written (#312): the draft is read again
  let revisionSeen = untrack(() => history.revision);
  $effect(() => {
    const revision = history.revision;
    if (revision === revisionSeen) return;
    revisionSeen = revision;
    untrack(() => (reload += 1));
  });
  // A pick's save failed (the autosaver says why in the top bar): the draft's own pick comes back
  $effect(() => {
    if (saving && autosave.status.state === "failed") untrack(() => { saving = false; reload += 1; });
  });

  /** The pick's choices: scenes with a target that has AR content, and those targets */
  const choices = $derived(draft ? landingPickScenes(draft.configuration) : null);
  const sceneLabels = $derived(Object.fromEntries((draft?.configuration.scenes ?? []).map(scene => [scene.id, scene.label])));

  /** A new pick: shown at once, saved through the autosaver, the stage follows once the draft holds it */
  const pick = (next: LandingPick) => {
    const id = experienceId;
    notice = null;
    landing = { scene: next.scene, target: next.target };
    saving = true;
    saveLandingPick(id, next, stored => {
      if (experienceId !== id || landing?.scene !== stored.scene || landing?.target !== stored.target) return;
      landing = stored;
      saving = false;
      reload += 1;
    });
  };
  /** A card of the Scenes panel: its scene's first target with AR content becomes the pick */
  const pickScene = (sceneId: string) => {
    const scene = choices?.find(s => s.id === sceneId);
    if (!scene) {
      notice = `${sceneLabels[sceneId] || sceneId} has no target with AR content (a model, a video, a component) – the landing's hero needs one.`;
      return;
    }
    if (landing?.scene !== sceneId) pick({ scene: sceneId, target: scene.targets[0] });
  };

  const STAGE_HELP = "The landing page a computer gets, with this draft: the title, the hero (the pick's target with its AR content on its print), the QR card, the shop and the footer. It scrolls inside the stage. Published, it is the experience's address on a computer.";
</script>

{#snippet stageView()}
  <LandingStage {experienceId} data={draft?.data ?? null} />
  {#if loadError}
    <p class="notice danger" role="alert">{loadError} <button type="button" class="text-link" onclick={() => (reload += 1)}>Try again</button></p>
  {:else if !draft}
    <p class="notice muted">Loading the draft…</p>
  {/if}
  {#if notice}
    <p class="notice" role="status">{notice} <button type="button" class="text-link" onclick={() => (notice = null)}>OK</button></p>
  {/if}
{/snippet}

{#snippet tabBody(t: string)}
  {#if t === "inspector"}
    <div class="body">
      {#if draft}
        {#key experienceId}
          <LandingSection {experienceId} experience={draft.configuration.experience} {sceneLabels} {choices} bind:landing {saving} open
            onpick={pick} onsaved={() => (reload += 1)} />
        {/key}
      {:else}
        <p class="small muted">{loadError ?? "Loading the draft…"}</p>
      {/if}
    </div>
  {:else if t === "scenes"}
    <ScenesPanel {experienceId} experienceTitle={scenes.tree?.experience.title ?? ""} current={landing?.scene ?? ""} floating
      assetsBase={scenes.tree?.experience.assetsBase ?? ""} onopen={pickScene} onselectgroup={() => {}} />
  {:else if t === "info"}
    <InfoView floating />
  {:else if t === "history"}
    <HistoryPanel />
  {/if}
{/snippet}

<Workspace {floats} stage={stageView} tab={tabBody} help={{ name: "Landing page", text: STAGE_HELP }}>
  <RevertPrompt />
  <PluginGuardPrompt />
</Workspace>

<style>
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: .375rem .5rem .75rem; display: flex; flex-direction: column; gap: .125rem; container: panel / inline-size; }
  .notice { position: absolute; left: 50%; top: 1rem; transform: translateX(-50%); z-index: 1; margin: 0; padding: .25rem .75rem; border: 1px solid var(--line);
    border-radius: var(--control-radius); background: var(--surface); color: var(--text); max-width: min(34rem, calc(100% - 2rem)); }
</style>
