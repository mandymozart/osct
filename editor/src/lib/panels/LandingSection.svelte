<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import type { ExperienceData } from "@shared/types/game-config";
  import type { ExperienceLanding } from "@shared/types/landing";
  import { landingHeroStale } from "@shared/api/landing-extract";
  import { putExperience } from "#lib/api.js";
  import { autosave } from "#lib/autosave.svelte.js";
  import { extractLanding, landingPickLabel } from "#lib/landing-pick.js";
  import { selection } from "#lib/selection.svelte.js";
  import Section from "#lib/components/Section.svelte";

  /**
   * The experience's **Landing page** in its Inspector (#355, content schema 6.1): the target with AR content (a model,
   * a video, a component) the desktop landing's hero shows – picked on the stage (a target's menu: *Use for the landing page*). Values only: the
   * scene and the target (a link opens the scene with the target selected), whether the stored hero is still what the
   * draft holds (extracted again when the section shows – *out of date* offers *Refresh*), and *Remove*. Saves go
   * through the autosaver like every edit (RULES #37); History shows them.
   */
  let { experienceId, experience, sceneLabels = {}, onsaved }: {
    experienceId: string;
    experience: ExperienceData;
    /** The scenes' labels by id: the pick names its scene so */
    sceneLabels?: Record<string, string>;
    /** The experience's landing changed in the draft */
    onsaved?: () => void;
  } = $props();

  let landing = $state<ExperienceLanding | null>(untrack(() => experience.landing ?? null));
  /** What the draft holds now for the pick: null while it is read; `problem` when the pick cannot be the hero any more */
  let fresh = $state<{ landing: ExperienceLanding } | { problem: string } | null>(null);

  $effect(() => {
    const pick = landing;
    const id = experienceId;
    fresh = null;
    if (!pick) return;
    let gone = false;
    extractLanding(id, { scene: pick.scene, target: pick.target }).then(
      result => { if (!gone) fresh = result; },
      () => { if (!gone) fresh = null; },
    );
    return () => { gone = true; };
  });

  const stale = $derived(!!landing && !!fresh && landingHeroStale(landing, "landing" in fresh ? fresh.landing : null));
  const status = $derived(!landing ? "" : !fresh ? "checking…" : "problem" in fresh ? fresh.problem : stale ? "out of date" : "up to date");
  const KEY = $derived(`experience:${experienceId}:landing`);

  /** Saves the landing (null removes it) through the autosaver */
  const save = (next: ExperienceLanding | null) => {
    const id = experienceId;
    const done = onsaved;
    landing = next;
    autosave.queue(KEY, async () => {
      await putExperience(id, { landing: next });
      done?.();
    });
  };
  /** Refresh: the pick's hero extracted from the draft again */
  const refresh = () => {
    if (fresh && "landing" in fresh) save(fresh.landing);
  };
  /** The pick's scene opens with its target selected */
  const show = () => {
    if (!landing) return;
    const select = { target: landing.target, node: [] as number[], onTarget: true };
    if (page.params.scene === landing.scene) selection.show(select);
    else {
      selection.requestOn(landing.scene, select);
      void goto(resolve(`${experienceId}/${landing.scene}/`));
    }
  };
</script>

<Section id="experience.landing" label="landing page" open={false} summary={landing ? landingPickLabel(landing, sceneLabels[landing.scene]) : "none"}
  help="The desktop landing's hero: one target with AR content (a model, a video, a component) on one scene – the book opens on that scene's surface and the content rises from its print. Pick it on the stage: right-click a target with AR content, Use for the landing page. Its picture, the entity and the experience's looks are stored with the pick; publish writes them into the version's landing.json. None: the landing shows the experience's first model.">
  {#if landing}
    <div class="row" data-help-name="Landing scene" data-help="The scene the landing's book opens on – click to open it with the target selected.">
      <span class="label">scene</span>
      <button type="button" class="text-link value" onclick={show}>{sceneLabels[landing.scene] || landing.scene}</button></div>
    <div class="row" data-help-name="Landing target" data-help="The target whose AR content the landing's hero shows; its surface is the one the book opens on.">
      <span class="label">target</span><span class="value small">{landing.target}</span></div>
    <div class="row" data-help-name="Landing hero" data-help="Up to date: the stored hero is what the draft holds now. Out of date: the entity, a print, the looks or the layout changed since it was picked – Refresh takes them from the draft again. A problem (the target was removed or has no AR content any more) needs another pick.">
      <span class="label">hero</span><span class="value small" class:danger={!!fresh && "problem" in fresh} class:muted={!stale}>{status}</span>
      {#if stale}<button type="button" class="pill" onclick={refresh}>Refresh</button>{/if}</div>
    <div class="actions">
      <button type="button" class="text-link" onclick={() => save(null)} data-help-name="Remove the landing's pick"
        data-help="Removes the pick from the draft: the landing shows the experience's first model again (after the next publish).">Remove</button>
    </div>
  {:else}
    <div class="row" data-help-name="Landing target" data-help="No pick: the landing shows the experience's first model. Right-click a target with AR content on the stage – Use for the landing page.">
      <span class="label">target</span><span class="value small muted">none</span></div>
  {/if}
</Section>

<style>
  .value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; text-align: left; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .25rem; }
</style>
