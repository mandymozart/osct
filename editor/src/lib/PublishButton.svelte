<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    ApiError, errorText, getDraftManifest, listExperiences, listEnvironments, publishExperience,
    type ExperienceSummary, type EnvironmentUnreadable, type EnvironmentsInfo, type PublishResult,
  } from "#lib/api.js";
  import { pluginRegistrySnapshot } from "@engine/scene/plugins";
  import { liveLabels, liveShort } from "#lib/live.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { transpilePlugin } from "#lib/plugins/compile.js";
  import { carriedPlugins } from "#lib/publish-plugins.js";
  import { publishStep, targetLabel, targetOf, type PublishStep } from "#lib/publish-target.js";
  import Icon from "#lib/components/Icon.svelte";

  /**
   * Publish: the draft becomes a content version of this instance's own environment (`POST /editor/experiences/{id}/publish`)
   * – an instance publishes there and nowhere else (#183). Next to the button: where the experience is live and, where this
   * server is the target, that no CDN is connected. The button is an icon (#274); its title names the target with its
   * backend (`staging · CDN`, `local · this server`), as does the step. The button opens a step in the page that names the
   * experience, the build, the target and the build of it it replaces there – each experience has its own store in every
   * environment (#87), so a publish never touches another experience. The publish carries the Code tab's saved sources,
   * transpiled here (#78): a source that does not compile stops it with its line.
   */
  let { experienceId }: { experienceId: string } = $props();
  let info = $state<EnvironmentsInfo | null>(null);
  let experiences = $state<ExperienceSummary[]>([]);
  let unreadable = $state<EnvironmentUnreadable[]>([]);
  let step = $state<PublishStep | null>(null);
  let busy = $state(false);
  let result = $state<PublishResult | null>(null);
  let error = $state<string | null>(null);
  let stepElement = $state<HTMLElement | null>(null);

  const target = $derived(targetOf(info));
  const self = $derived(experiences.find(x => x.id === experienceId));

  const refresh = async () => {
    try {
      const [data, envs] = await Promise.all([listExperiences(), listEnvironments()]);
      experiences = data.experiences;
      unreadable = data.environments;
      info = envs;
    } catch {
      // the publish itself still guards; the line next to the button stays empty
    }
  };
  onMount(() => void refresh());

  /** Opens the step: the experience, its build now, the target and what it replaces there */
  const open = async () => {
    if (!target) return;
    error = null;
    result = null;
    let build: string | null = null;
    try {
      build = (await getDraftManifest(experienceId)).build;
    } catch {
      // the step still names the experience and the target
    }
    const live = unreadable.some(e => e.env === target.env) ? "unreadable" : self?.live.find(l => l.env === target.env);
    if (plugins.experienceId !== experienceId) await plugins.load(experienceId);
    step = publishStep(self?.title ?? experienceId, build, target, live, plugins.stored.length);
    await tick();
    stepElement?.querySelector<HTMLButtonElement>("button.primary")?.focus();
  };

  const publish = async () => {
    if (!target || !step) return;
    busy = true;
    error = null;
    try {
      // The saved sources (not the Code tab's unsaved edits), with the specs of their stage runs
      if (plugins.experienceId !== experienceId) await plugins.load(experienceId);
      const sources = await Promise.all(plugins.stored.map(async p => ({ id: p.id, source: await plugins.source(experienceId, p.id) })));
      const carried = await carriedPlugins(sources, transpilePlugin, pluginRegistrySnapshot());
      if ("error" in carried) {
        error = carried.error;
        return;
      }
      result = await publishExperience(experienceId, target.env, carried.plugins.length ? { plugins: carried.plugins } : {});
      step = null;
    } catch (e) {
      error = errorText(e, { code: true });
    } finally {
      busy = false;
      void refresh();
    }
  };
</script>

<span class="publish">
  {#if self}
    <span class="small muted live" data-help-name="Live" data-help={`Where this experience is live – the environments that serve a build of it: ${liveLabels(self.live).join("; ")}.`}>{liveShort(self.live)}</span>
  {/if}
  {#if target}
    {#if target.warning}<span class="small danger no-cdn" title={target.warning} data-help-name="No CDN" data-help={target.warning}>No CDN connected</span>{/if}
  {/if}
  <button type="button" class="icon-button publish-button" onclick={() => open()} disabled={busy || !target || !!step} aria-label={busy ? "Publishing…" : "Publish"}
    title={busy ? "Publishing…" : target ? `Publish the draft to ${targetLabel(target)} – a step in the page names the experience and the build first.` : "Publish the draft"}><Icon name="publish" stroke={2} /></button>
  {#if result}<span class="small muted done">published {result.build}</span>{/if}
  {#if error && !step}<span class="small danger">{error}</span>{/if}
  {#if step}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="step" role="dialog" aria-label="Publish" tabindex="-1" bind:this={stepElement} onkeydown={e => { if (e.key === "Escape") step = null; }}>
      <p class="head">{step.title}</p>
      <p>{step.build}</p>
      <p>{step.replaces}</p>
      {#if step.readers}<p class="strong">{step.readers}</p>{/if}
      {#if step.warning}<p class="danger" role="alert">{step.warning}</p>{/if}
      {#if error}<p class="danger">{error}</p>{/if}
      <p class="actions">
        <button type="button" class="pill primary" onclick={publish} disabled={busy}>{busy ? "Publishing…" : step.action}</button>
        <button type="button" class="text-link" onclick={() => (step = null)}>Cancel</button>
      </p>
    </div>
  {/if}
</span>

<style>
  .publish { position: relative; display: inline-flex; align-items: center; gap: .375rem; }
  .live, .no-cdn, .done { white-space: nowrap; }
  .publish-button { border-color: var(--text); }
  .step { position: absolute; top: calc(100% + .5rem); right: 0; z-index: 30; width: min(24rem, calc(100vw - 1rem)); display: grid; gap: .375rem;
    padding: .75rem; border: 1px solid var(--line); background: var(--surface); color: var(--text); box-shadow: 0 8px 24px -8px rgb(0 0 0 / .25); }
  .step p { margin: 0; line-height: 1.45; white-space: normal; }
  .step .head { font-weight: 600; }
  .step .strong { font-weight: 600; }
  .step .actions { display: flex; align-items: center; gap: .75rem; margin-top: .25rem; }
  @media (max-width: 47.9rem) {
    .live, .done { display: none; }
    .no-cdn { display: none; }
    .publish-button { border-color: transparent; }
    .step { position: fixed; top: calc(var(--top-height) + .25rem); right: .5rem; left: .5rem; width: auto; }
  }
</style>
