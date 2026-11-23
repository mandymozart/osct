<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import type { ExperienceData } from "@shared/types/game-config";
  import { type ExperienceLanding, landingExtrasOf, landingPickOf, type LandingPick } from "@shared/types/landing";
  import { landingHeroStale } from "@shared/api/landing-extract";
  import { putExperience } from "#lib/api.js";
  import { autosave } from "#lib/autosave.svelte.js";
  import { extractLanding, heroOf, landingPickLabel, landingSaveKey, type LandingPickScene, withoutLandingPick } from "#lib/landing-pick.js";
  import { selection } from "#lib/selection.svelte.js";
  import Section from "#lib/components/Section.svelte";

  /**
   * The experience's **Landing page** (#355, content schema 6.1): the target with AR content (a model, a video, a
   * component) the desktop landing's hero shows. Values only: the pick, whether the stored hero is still what the draft
   * holds (extracted again when the section shows – *out of date* offers *Refresh*), and *Remove*. Saves go through the
   * autosaver like every edit (RULES #37); History shows them.
   *
   * In the experience's Inspector (⚙ in a scene) the pick is made on the stage (a target's menu: *Use for the landing
   * page*): the scene is a link that opens it with the target selected, and *Landing page* opens the landing workspace
   * (#356). In the landing workspace (`choices`) the pick is two selects – the scenes with a target that has AR content,
   * and those targets only (`landingPickScenes`); a choice goes to `onpick`, which saves it (`saveLandingPick`).
   */
  let { experienceId, experience, sceneLabels = {}, onsaved, onchange, choices = null, onpick, saving = false, open = false,
    landing = $bindable(untrack(() => experience.landing ?? null)) }: {
    experienceId: string;
    experience: ExperienceData;
    /** The scenes' labels by id: the pick names its scene so */
    sceneLabels?: Record<string, string>;
    /** The experience's landing changed in the draft (a refresh or a removal) */
    onsaved?: () => void;
    /** The landing workspace saves the whole landing itself (its texts and shop with it, #365): a refresh or a removal goes here */
    onchange?: (next: ExperienceLanding | null) => void;
    /** The landing workspace: the pick's choices – a scene, then one of its targets with AR content */
    choices?: LandingPickScene[] | null;
    /** A pick chosen in the selects (the landing workspace) */
    onpick?: (pick: LandingPick) => void;
    /** A pick is being saved: its hero is not known yet */
    saving?: boolean;
    /** Open when it first shows */
    open?: boolean;
    /** The pick as the draft holds it (the landing workspace shares it with its Scenes panel) */
    landing?: ExperienceLanding | null;
  } = $props();

  /** What the draft holds now for the pick: null while it is read; `problem` when the pick cannot be the hero any more */
  let fresh = $state<{ landing: ExperienceLanding } | { problem: string } | null>(null);

  /** The pick – a landing may hold texts and a shop without one (#365) */
  const pick = $derived(landingPickOf(landing));

  $effect(() => {
    const picked = pick;
    const id = experienceId;
    fresh = null;
    if (!picked || saving) return;
    let gone = false;
    extractLanding(id, picked).then(
      result => { if (!gone) fresh = result; },
      () => { if (!gone) fresh = null; },
    );
    return () => { gone = true; };
  });

  const stale = $derived(!!pick && !!fresh && landingHeroStale(landing, "landing" in fresh ? fresh.landing : null));
  const status = $derived(!pick ? "" : saving ? "saving…" : !fresh ? "checking…" : "problem" in fresh ? fresh.problem : stale ? "out of date" : "up to date");
  const KEY = $derived(landingSaveKey(experienceId));

  /** Saves the landing (null removes it) through the autosaver – or hands it to the workspace that saves it */
  const save = (next: ExperienceLanding | null) => {
    if (onchange) return onchange(next);
    const id = experienceId;
    const done = onsaved;
    landing = next;
    autosave.queue(KEY, async () => {
      await putExperience(id, { landing: next });
      done?.();
    });
  };
  /** Refresh: the pick's hero extracted from the draft again (the landing's texts and shop as they are) */
  const refresh = () => {
    if (fresh && "landing" in fresh) save({ ...heroOf(fresh.landing), ...landingExtrasOf(landing) });
  };
  /** The pick's scene opens with its target selected */
  const show = () => {
    if (!pick) return;
    const select = { target: pick.target, node: [] as number[], onTarget: true };
    if (page.params.scene === pick.scene) selection.show(select);
    else {
      selection.requestOn(pick.scene, select);
      void goto(resolve(`${experienceId}/${pick.scene}/`));
    }
  };

  /** The landing workspace's selects: a scene takes its first target with AR content, a target is the pick */
  const chosenScene = $derived(choices?.find(scene => scene.id === pick?.scene) ?? null);
  const chooseScene = (sceneId: string) => {
    const target = choices?.find(scene => scene.id === sceneId)?.targets[0];
    if (target) onpick?.({ scene: sceneId, target });
  };
  const chooseTarget = (target: string) => {
    if (pick) onpick?.({ scene: pick.scene, target });
  };
</script>

<Section id={choices ? "landing.pick" : "experience.landing"} label="landing page" {open} summary={pick ? landingPickLabel(pick, sceneLabels[pick.scene]) : "none"}
  help="The desktop landing's hero: one target with AR content (a model, a video, a component) on one scene – the book opens on that scene's surface and the content rises from its print. Pick it on the stage (right-click a target with AR content, Use for the landing page) or in the landing workspace. Its picture, the entity and the experience's looks are stored with the pick; publish writes them into the version's landing.json. None: the landing shows the experience's first model.">
  {#if choices}
    <div class="row" data-help-name="Landing scene" data-help="The scene the landing's book opens on. Only scenes with a target that has AR content (a model, a video, a component) are offered; a scene takes its first such target.">
      <span class="label">scene</span>
      <select class="field" aria-label="The hero's scene" value={pick?.scene ?? ""} onchange={e => chooseScene(e.currentTarget.value)} disabled={!choices.length}>
        {#if !pick}<option value="">{choices.length ? "the default (first model)" : "no target with AR content"}</option>{/if}
        {#if pick && !chosenScene}<option value={pick.scene}>{sceneLabels[pick.scene] || pick.scene}</option>{/if}
        {#each choices as scene (scene.id)}<option value={scene.id}>{scene.label || scene.id}</option>{/each}
      </select></div>
    <div class="row" data-help-name="Landing target" data-help="The target whose AR content the landing's hero shows; its surface is the one the book opens on. Marginalia and links cannot be the hero and are not offered.">
      <span class="label">target</span>
      <select class="field" aria-label="The hero's target" value={pick?.target ?? ""} onchange={e => chooseTarget(e.currentTarget.value)} disabled={!pick || !chosenScene}>
        {#if !pick}<option value="">–</option>{/if}
        {#if pick && !chosenScene?.targets.includes(pick.target)}<option value={pick.target}>{pick.target}</option>{/if}
        {#each chosenScene?.targets ?? [] as target (target)}<option value={target}>{target}</option>{/each}
      </select></div>
  {:else if pick}
    <div class="row" data-help-name="Landing scene" data-help="The scene the landing's book opens on – click to open it with the target selected.">
      <span class="label">scene</span>
      <button type="button" class="text-link value" onclick={show}>{sceneLabels[pick.scene] || pick.scene}</button></div>
    <div class="row" data-help-name="Landing target" data-help="The target whose AR content the landing's hero shows; its surface is the one the book opens on.">
      <span class="label">target</span><span class="value small">{pick.target}</span></div>
  {:else}
    <div class="row" data-help-name="Landing target" data-help="No pick: the landing shows the experience's first model. Right-click a target with AR content on the stage – Use for the landing page.">
      <span class="label">target</span><span class="value small muted">none</span></div>
  {/if}
  {#if pick}
    <div class="row" data-help-name="Landing hero" data-help="Up to date: the stored hero is what the draft holds now. Out of date: the entity, a print, the looks or the layout changed since it was picked – Refresh takes them from the draft again. A problem (the target was removed or has no AR content any more) needs another pick.">
      <span class="label">hero</span><span class="value small" class:danger={!!fresh && "problem" in fresh} class:muted={!stale}>{status}</span>
      {#if stale && !saving}<button type="button" class="pill" onclick={refresh}>Refresh</button>{/if}</div>
  {/if}
  <div class="actions">
    {#if !choices}
      <a class="text-link" href={resolve(`${experienceId}/landing/`)} data-help-name="Landing page"
        data-help="Opens the landing workspace: the landing page a computer gets, with this draft – its hero, QR card, shop and footer.">Landing page</a>
    {/if}
    {#if pick}
      <button type="button" class="text-link" onclick={() => save(withoutLandingPick(landing))} disabled={saving} data-help-name="Remove the landing's pick"
        data-help="Removes the pick from the draft: the landing shows the experience's first model again (after the next publish).">Remove</button>
    {/if}
  </div>
</Section>

<style>
  .value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; text-align: left; }
  .row > .field { width: 100%; min-width: 0; }
  .actions { display: flex; align-items: center; gap: .75rem; margin-top: .25rem; }
  .actions a { text-decoration: none; }
</style>
