<script lang="ts">
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import { narrativeSummary } from "#lib/stage/log-entries.js";
  import PassesPanel from "./PassesPanel.svelte";
  import SceneSection from "./SceneSection.svelte";
  import LogicRules from "./LogicRules.svelte";

  /**
   * The **scene** in the Inspector (#229 – the Stage tab's until then): what the Inspector shows while the scene is
   * selected – the tree's top row, a click on the stage that picks nothing, a fresh workspace. Collapsible sections
   * (open state kept per section): the **scene** (`SceneSection`: label, group, targets, arrange in a row), the scene's own
   * **post-processing** (an override of the experience's, #307 3c – the experience's passes and appearance are behind the
   * experience settings ⚙, `ExperiencePanel`), the scene's **rules**, and one line about the **narrative** of the
   * experience's plugins – how many variables and events the stage has, with links to the **Variables** tab (the live
   * variables, set by hand, reset) and the **Log** tab (the timeline, the problems, tap) where that work happens (#337).
   * The surfaces are the Tree's and the selected surface's (#337). How the stage shows the scene – shake, origin, the
   * desk's top, the sky – is the toolbar's *view* group (`ViewMenu.svelte`), the grid its *grid & snap* group.
   * Explanations are the controls' help in the Info view.
   */
  let { stage, experienceId, sceneId, ontab }: {
    stage: Stage | null; experienceId: string; sceneId: string;
    /** The narrative line's links: the workspace shows the Variables or the Log tab */
    ontab?: (tab: "variables" | "log") => void;
  } = $props();
</script>

<SceneSection {experienceId} {sceneId} />

<!-- The scene's own post-processing, a child of its parameters; the experience's passes and appearance are behind the
     experience settings ⚙ (ExperiencePanel) – #307 3c, Tilman -->
<PassesPanel {stage} {experienceId} {sceneId} level="scene" />

<!-- The scene's own rules (content schema 5.0, #334): live while the scene is open -->
<LogicRules home="scene" {sceneId} {stage} />

<!-- The narrative at the scene's level (#337): the work happens in the Variables and Log tabs -->
<div class="row narrative" data-help="The plugins' variables on the stage and the stage's timeline, in one line: the Variables tab shows and sets the variables, the Log tab the events, the rules' and the plugins' lines and the problems – and taps a target.">
  <span class="label">narrative</span>
  <span class="controls">
    <span class="small muted">{narrativeSummary(stage?.vars.length ?? 0, stage?.events.length ?? 0)}</span>
    <button type="button" class="text-link" onclick={() => ontab?.("variables")} title="Open the Variables tab: the live variables, set one, reset">variables</button>
    <button type="button" class="text-link" onclick={() => ontab?.("log")} title="Open the Log tab: the events, the rules' and the plugins' lines, the problems, tap">log</button>
  </span></div>

<style>
  .narrative { margin-top: .25rem; }
</style>
