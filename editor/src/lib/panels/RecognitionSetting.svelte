<script lang="ts">
  import { untrack } from "svelte";
  import { RECOGNITION_MODES, type ExperienceData, type RecognitionMode } from "@shared/types/game-config";
  import { errorText, putExperience } from "#lib/api.js";
  import Section from "#lib/components/Section.svelte";
  import Segmented from "#lib/components/Segmented.svelte";

  /**
   * The experience's recognition path (#306, content schema 4.2) in its settings: **Original** (the default – the reader
   * makes every target's recognition frame from its printed image on the phone, the path tested with every target) or
   * **Prepared** (a target's frame made ahead where it has one and is not set to *original only*). Saved at once. A
   * phone's debug overlay may override it there for a comparison.
   */
  let { experienceId, experience, onsaved }: {
    experienceId: string;
    experience: ExperienceData;
    onsaved?: (experience: ExperienceData) => void;
  } = $props();

  let mode = $state<RecognitionMode>(untrack(() => (experience.recognition === "prepared" ? "prepared" : "original")));
  let busy = $state(false);
  let error = $state<string | null>(null);

  const LABELS: Record<RecognitionMode, string> = { original: "Original", prepared: "Prepared" };
  const TITLES: Record<RecognitionMode, string> = {
    original: "The reader makes every target's frame from its printed image on the phone – the default, tested with every target",
    prepared: "The reader uses a target's frame made ahead where it has one – only after a test run on the phones",
  };

  const choose = async (next: RecognitionMode) => {
    if (next === mode || busy) return;
    const before = mode;
    mode = next;
    busy = true;
    error = null;
    try {
      const answer = await putExperience(experienceId, { recognition: next === "original" ? null : next });
      onsaved?.(answer.experience);
    } catch (e) {
      mode = before;
      error = errorText(e);
    } finally {
      busy = false;
    }
  };
</script>

<Section id="experience.recognition" label="recognition" open={false} summary={LABELS[mode]}
  help="How the reader's image tracker gets each target's recognition frame. Original (the default): made from the printed image on the phone when a scene opens – the path tested with every target, small black-and-white ones included. Prepared: the frame the editor made ahead (the target's inspector shows it) – saves the phone that step; a target set to original only keeps the printed image. Switch to Prepared only after a test run on the phones. A phone's debug overlay can override this for a comparison.">
  <div class="row"><span class="label">frames</span>
    <span class="controls"><Segmented options={RECOGNITION_MODES} value={mode} labels={LABELS} titles={TITLES} label="Recognition" onchange={next => void choose(next)} /></span></div>
  {#if error}<p class="small danger">{error}</p>{/if}
</Section>
