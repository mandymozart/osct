<script lang="ts">
  import { errorText, getExperience, type ExperienceTree } from "#lib/api.js";
  import ExperienceTexts from "#lib/ExperienceTexts.svelte";
  import PassesPanel from "./PassesPanel.svelte";
  import AppearancePanel from "./AppearancePanel.svelte";
  import RecognitionSetting from "./RecognitionSetting.svelte";
  import LandingSection from "./LandingSection.svelte";
  import LogicRules from "./LogicRules.svelte";
  import type { Stage } from "#lib/stage/stage.svelte.js";

  /**
   * The Inspector while the experience is selected (#237 – the top bar's ⚙ after the experience's crumb): its texts
   * (the title, and the **Printed book** switch with the book's author and publisher – `ExperienceTexts`, #320), the
   * desktop landing's hero (`LandingSection`, #355), its post-processing and appearance (#307 3c – every scene without its own shows them) and where its content files live.
   */
  let { experienceId, stage = null, sceneId = null }: {
    experienceId: string;
    /** In a scene's workspace: the stage the experience's looks preview on (#307 3c) */
    stage?: Stage | null;
    sceneId?: string | null;
  } = $props();

  let tree = $state<ExperienceTree | null>(null);
  let error = $state<string | null>(null);
  $effect(() => {
    const id = experienceId;
    getExperience(id).then(t => (tree = t), e => (error = errorText(e)));
  });
  const reload = () => void getExperience(experienceId).then(t => (tree = t));
</script>

<div class="head">
  <span class="section-label grow">experience</span>
</div>
{#if error}
  <p class="small danger">{error}</p>
{:else if !tree}
  <p class="small muted">Loading the experience…</p>
{:else}
  {#key tree.experience.id}
    <ExperienceTexts {experienceId} experience={tree.experience.experience} onsaved={reload} />
    <!-- How the reader gets its targets' recognition frames (#306): Original by default -->
    <RecognitionSetting {experienceId} experience={tree.experience.experience} />
    <!-- The desktop landing's hero (#355, schema 6.1): the pick, out of date or not, refresh and remove -->
    <LandingSection {experienceId} experience={tree.experience.experience} sceneLabels={Object.fromEntries(tree.scenes.map(s => [s.id, s.label]))} />
  {/key}
  {#if sceneId}
    <!-- The experience's looks (#307 3c, Tilman): its post-processing and how entities appear – every scene without its own -->
    <PassesPanel {stage} {experienceId} {sceneId} level="experience" />
    <AppearancePanel {stage} {experienceId} />
  {/if}
  <!-- The experience's own rules and its variables (content schema 5.0, #334): live for the whole session -->
  <LogicRules home="experience" {stage} />
  <div class="row" data-help-name="Assets" data-help="Where the experience's content files (the layout, the imported pictures, models and videos) are read from – set by the import; empty: the draft's own origin.">
    <span class="label">assets</span><span class="value small muted" title={tree.experience.assetsBase || "the draft's origin"}>{tree.experience.assetsBase || "the draft's origin"}</span>
  </div>
{/if}

<style>
  .head { display: flex; align-items: center; gap: .5rem; min-height: var(--control-height); }
  .grow { flex: 1; }
  .value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
