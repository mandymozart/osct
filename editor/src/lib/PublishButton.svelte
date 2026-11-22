<script lang="ts">
  import { beforeNavigate } from "$app/navigation";
  import { onMount, tick } from "svelte";
  import {
    errorText, getDraftManifest, getPublishJob, latestPublishJob, listExperiences, listEnvironments, publishExperience,
    type ExperienceSummary, type EnvironmentUnreadable, type EnvironmentsInfo, type LiveIn, type PublishJob,
  } from "#lib/api.js";
  import { pluginRegistrySnapshot } from "@engine/scene/plugins";
  import { liveLabels, liveShort } from "#lib/live.js";
  import { readerAddress } from "#lib/new-experience.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { transpilePlugin } from "#lib/plugins/compile.js";
  import { carriedPlugins, type CarriedPlugins } from "#lib/publish-plugins.js";
  import { targetLabel, targetOf } from "#lib/publish-target.js";
  import { runPublish, type PublishCalls } from "#lib/publish-job.js";
  import {
    confirmView, doneView, failedView, jobLog, runningView, stamped, startLog, unknownView, type EndView, type LogLine,
  } from "#lib/publish-overlay.js";
  import Icon from "#lib/components/Icon.svelte";

  /**
   * Publish: the draft becomes a content version of this instance's own environment (`POST /editor/experiences/{id}/publish`)
   * – an instance publishes there and nowhere else (#183); each experience has its own store in every environment (#87).
   * The top bar has the icon button (#274) and where the experience is live. The button opens one centered overlay over the
   * dimmed page (#345, Tilman 2026-11-22) in three states – **confirm** (what readers get, when it was published last, a
   * danger line only when something stops the publish), **running** (live for readers yet, the export archive's count) and
   * **done** (what was written; it closes itself after 2 s) – with a small log behind *Details* (Ctrl+L) for the build, the
   * build it replaces, the carried plugins and every step (`publish-overlay.ts`). The publish carries the Code tab's saved
   * sources, transpiled here (#78). A publish is a job on the server (`publish-job.ts`): a gateway's timeout is never shown
   * as a failure of a publish that runs on, and a publish already running (another tab, a reload) is followed.
   */
  let { experienceId }: { experienceId: string } = $props();
  let info = $state<EnvironmentsInfo | null>(null);
  let experiences = $state<ExperienceSummary[]>([]);
  let unreadable = $state<EnvironmentUnreadable[]>([]);

  type Mode = "confirm" | "running" | "done" | "failed" | "unknown";
  let mode = $state<Mode | null>(null);
  /** The draft's build when the overlay opened */
  let build = $state<string | null>(null);
  /** The Code tab's sources as the publish carries them – checked when the overlay opens */
  let carried = $state<CarriedPlugins | null>(null);
  let checking: Promise<void> | null = null;
  let sourceCount = $state(0);
  /** The running publish's job, as the last poll reported it */
  let job = $state<PublishJob | null>(null);
  /** Followed a publish started elsewhere (another tab, before a reload) */
  let following = $state(false);
  let end = $state<EndView | null>(null);
  let log = $state<LogLine[]>([]);
  let detailsOpen = $state(false);
  let pointerInside = $state(false);
  let dialog = $state<HTMLElement | null>(null);
  let logElement = $state<HTMLElement | null>(null);
  let button = $state<HTMLButtonElement | null>(null);

  const busy = $derived(mode === "running");
  const target = $derived(targetOf(info));
  const self = $derived(experiences.find(x => x.id === experienceId));
  const live = $derived<LiveIn | "unreadable" | undefined>(
    target ? (unreadable.some(e => e.env === target.env) ? "unreadable" : self?.live.find(l => l.env === target.env)) : undefined,
  );
  const problem = $derived(carried && "error" in carried ? carried.error : null);
  const asking = $derived(target ? confirmView({ title: self?.title ?? experienceId, env: target.env, live, build, plugins: sourceCount, problem }) : null);
  const running = $derived(runningView(job));
  const reader = $derived(typeof location === "undefined" ? null : readerAddress(location.origin, experienceId));

  /* While a publish runs, leaving the page – a reload, closing the tab, another page of the editor – asks first: on a host
     where the server cannot write on after its answer, the editor's polls are what writes the rest */
  $effect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  });
  beforeNavigate(navigation => {
    if (busy && navigation.type !== "leave" && !window.confirm("A publish is still running. Leave this page? Readers already have the build once it is live; the rest is written when the editor looks again.")) navigation.cancel();
  });

  /* The overlay owns the keyboard while it is open: Ctrl+L toggles Details (not the Library behind it), Esc cancels the
     confirm and closes an ended publish, Tab stays in the overlay; no key reaches the page (a Delete, an arrow) */
  $effect(() => {
    if (!mode) return;
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if ((event.key === "l" || event.key === "L") && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        if (mode !== "confirm") detailsOpen = !detailsOpen;
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (mode !== "running") close();
      } else if (event.key === "Tab" && dialog) {
        const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], summary")];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const inside = dialog.contains(document.activeElement);
        if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  /* The log follows its newest line */
  $effect(() => {
    if (log.length && detailsOpen && logElement) logElement.scrollTop = logElement.scrollHeight;
  });

  /* Done closes itself after 2 s – not while the pointer is over it or Details is open */
  $effect(() => {
    if (mode !== "done" || pointerInside || detailsOpen) return;
    const timer = setTimeout(close, 2000);
    return () => clearTimeout(timer);
  });

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

  const note = (texts: string[]) => {
    if (texts.length) log = [...log, ...stamped(texts, new Date())];
  };

  /** Focuses the overlay's first element of a kind once it is drawn (the overlay itself when there is none) */
  const focus = async (selector: string | null) => {
    await tick();
    ((selector ? dialog?.querySelector<HTMLElement>(selector) : null) ?? dialog)?.focus();
  };

  function close() {
    if (busy) return;
    mode = null;
    end = null;
    detailsOpen = false;
    pointerInside = false;
    // Back to the button once it is enabled again
    void tick().then(() => button?.focus());
  }

  /** Follows a publish to its end and shows how it ended */
  const follow = async (calls: Omit<PublishCalls, "progress" | "poll" | "latest">, before: string | null | undefined) => {
    mode = "running";
    // The overlay itself: nothing to press while it runs (Ctrl+L or Tab reach Details)
    void focus(null);
    let last: PublishJob | null = job;
    const seen = (next: PublishJob) => {
      note(jobLog(last, next));
      last = next;
      job = next;
    };
    try {
      const outcome = await runPublish({
        ...calls,
        poll: id => getPublishJob(experienceId, id),
        latest: () => latestPublishJob(experienceId),
        progress: seen,
      }, before);
      if (outcome.job && outcome.job !== last) seen(outcome.job);
      if (outcome.kind === "done") {
        end = doneView(outcome.result.env, outcome.job, outcome.result.export.error);
        mode = "done";
      } else if (outcome.kind === "failed") {
        if (!outcome.job) note([`failed: ${outcome.message}`]);
        end = failedView(outcome.message);
        mode = "failed";
        detailsOpen = true;
      } else {
        note([outcome.message]);
        end = unknownView(outcome.message);
        mode = "unknown";
      }
    } catch (e) {
      end = failedView(errorText(e, { code: true }));
      note([`failed: ${end.summary}`]);
      mode = "failed";
      detailsOpen = true;
    } finally {
      void refresh();
    }
    void focus("button.primary");
  };

  /** The Code tab's saved sources (not its unsaved edits), transpiled with the specs of their stage runs */
  const check = async () => {
    if (plugins.experienceId !== experienceId) await plugins.load(experienceId);
    sourceCount = plugins.stored.length;
    const sources = await Promise.all(plugins.stored.map(async p => ({ id: p.id, source: await plugins.source(experienceId, p.id) })));
    carried = await carriedPlugins(sources, transpilePlugin, pluginRegistrySnapshot());
  };

  /** Opens the overlay: a publish of the experience that still runs is followed, else the confirm */
  let opening = false;
  const open = async () => {
    if (!target || mode || opening) return;
    opening = true;
    log = [];
    end = null;
    job = null;
    following = false;
    detailsOpen = false;
    carried = null;
    build = null;
    try {
      const { job: runningJob } = await latestPublishJob(experienceId);
      if (runningJob?.status === "running") {
        following = true;
        note(["another publish of this experience is running – following it"]);
        void follow({ start: async () => ({ job: runningJob }) }, runningJob.id);
        return;
      }
    } catch {
      // the confirm works without it
    } finally {
      opening = false;
    }
    mode = "confirm";
    void focus("button.primary");
    checking = check().catch(e => {
      carried = { error: errorText(e, { code: true }) };
    }).then(() => {
      // Publish is off with a problem: the focus goes to Cancel
      if (mode === "confirm" && carried && "error" in carried) void focus("button.text-link");
    });
    try {
      build = (await getDraftManifest(experienceId)).build;
    } catch {
      // the confirm says it without the build
    }
  };

  const publish = async () => {
    if (!target || mode !== "confirm") return;
    await checking;
    if (!carried || "error" in carried) return;
    const env = target.env;
    const carriedNow = carried.plugins;
    note(startLog({ env, target: targetLabel(target), build, live, plugins: carriedNow.length, warning: target.warning }));
    // The newest job before the click: a job that turns up after a lost answer and is another one is this publish
    const before = await latestPublishJob(experienceId).then(({ job: latest }) => latest?.id ?? null, () => undefined);
    await follow({ start: () => publishExperience(experienceId, env, carriedNow.length ? { plugins: carriedNow } : {}) }, before);
  };
</script>

<span class="publish">
  {#if self}
    <span class="small muted live" data-help-name="Live" data-help={`Where this experience is live – the environments that serve a build of it: ${liveLabels(self.live).join("; ")}.`}>{liveShort(self.live)}</span>
  {/if}
  {#if target?.warning}<span class="small danger no-cdn" title={target.warning} data-help-name="No CDN" data-help={target.warning}>No CDN connected</span>{/if}
  <button type="button" class="icon-button publish-button" bind:this={button} onclick={() => open()} disabled={!target || !!mode} aria-label={busy ? "Publishing…" : "Publish"}
    title={busy ? "Publishing…" : target ? `Publish the draft to ${targetLabel(target)} – asks first.` : "Publish the draft"}><Icon name="publish" stroke={2} /></button>
</span>

{#if mode}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" data-app-ui onclick={e => { if (e.target === e.currentTarget && mode === "confirm") close(); }}>
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="publish-heading" tabindex="-1" bind:this={dialog}
      onpointerenter={() => (pointerInside = true)} onpointerleave={() => (pointerInside = false)}>
      {#if mode === "confirm" && asking}
        <h2 id="publish-heading">{asking.heading}</h2>
        <p>{asking.readers}</p>
        <p class="muted">{asking.last}</p>
        {#if asking.problem}<p class="danger" role="alert">{asking.problem}</p>{/if}
        <p class="actions">
          <button type="button" class="pill primary" onclick={publish} disabled={!!asking.problem}>Publish</button>
          <button type="button" class="text-link" onclick={close}>Cancel</button>
        </p>
      {:else if mode === "running"}
        <h2 id="publish-heading">{running.heading}</h2>
        <p role="status" aria-live="polite">{running.live}</p>
        {#if running.archive}
          <progress max={running.archive.total} value={running.archive.done} aria-label="Export archive"></progress>
          <p class="small muted count">{running.label}</p>
        {:else}<progress aria-label="Publishing"></progress>{/if}
        {#if following}<p class="small muted">Started elsewhere – another tab or before a reload.</p>{/if}
        <p class="small muted">Keep this page open until it is done.</p>
      {:else if end}
        <h2 id="publish-heading">{end.heading}</h2>
        <p class:danger={mode === "failed"} role={mode === "done" ? "status" : "alert"}>{end.summary}</p>
        {#if end.warning}<p class="danger">{end.warning}</p>{/if}
        <p class="actions">
          <button type="button" class="pill primary" onclick={close}>Close</button>
          {#if mode === "done" && reader}<a class="text-link" href={reader} target="_blank" rel="noopener">Open reader</a>{/if}
        </p>
      {/if}
      {#if mode !== "confirm"}
        <details class="details" bind:open={detailsOpen}>
          <summary class="small muted">Details <kbd>Ctrl+L</kbd></summary>
          <ol class="log" aria-label="Publish log" bind:this={logElement}>
            {#each log as line, i (i)}<li><span class="at">{line.at}</span> {line.text}</li>{/each}
          </ol>
        </details>
      {/if}
    </div>
  </div>
{/if}

<style>
  .publish { position: relative; display: inline-flex; align-items: center; gap: .375rem; }
  .live, .no-cdn { white-space: nowrap; }
  .publish-button { border-color: var(--text); }
  /* One overlay over the whole page, the page dimmed behind it (#345) */
  .backdrop { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 1rem; background: rgb(0 0 0 / .45); }
  .overlay { display: grid; gap: .5rem; width: min(28rem, 100%); max-height: calc(100vh - 2rem); overflow-y: auto; padding: 1rem 1.125rem;
    border: 1px solid var(--line); background: var(--surface); color: var(--text); box-shadow: 0 8px 24px -8px rgb(0 0 0 / .25); }
  .overlay:focus { outline: none; }
  h2 { margin: 0; font-size: 1rem; font-weight: 600; line-height: 1.35; }
  p { margin: 0; line-height: 1.45; }
  progress { width: 100%; height: .375rem; accent-color: var(--text); }
  .count { font-variant-numeric: tabular-nums; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .75rem; margin-top: .25rem; }
  .details { border-top: 1px solid var(--line); padding-top: .375rem; }
  .details summary { cursor: pointer; width: max-content; }
  kbd { font: inherit; font-size: .6875rem; padding: 0 .25rem; border: 1px solid var(--line); }
  .log { list-style: none; margin: .375rem 0 0; padding: .375rem .5rem; max-height: 12rem; overflow-y: auto; border: 1px solid var(--line);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .6875rem; line-height: 1.5; overflow-wrap: anywhere; }
  .log:empty::before { content: "Nothing yet."; color: var(--muted); }
  .at { color: var(--muted); }
  @media (max-width: 47.9rem) {
    .live, .no-cdn { display: none; }
    .publish-button { border-color: transparent; }
  }
</style>
