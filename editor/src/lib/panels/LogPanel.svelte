<script lang="ts">
  import { content } from "#lib/content.svelte.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import { formatElapsed } from "#lib/stage/event-log.js";
  import { tapTargets } from "#lib/stage/narrative.js";
  import {
    countKinds, filterLog, LOG_KIND_LABELS, LOG_KINDS, mergeLog, problemsSummary, readLogFilter, toggleLogKind, writeLogFilter, type LogKind, type LogProblem,
  } from "#lib/stage/log-entries.js";
  import { logicContent, logicFocus } from "#lib/logic-content.svelte.js";
  import { experienceProblems } from "#lib/logic/project.js";
  import { issueRows } from "#lib/logic/issues.js";
  import type { Context } from "#lib/logic/types.js";
  import { parseAddress } from "@engine/types";
  import Section from "#lib/components/Section.svelte";

  /**
   * The **Log** tab (#337): one timeline of what happens on the stage, newest first (`stage/log-entries.ts`) – the stage's
   * events (found, lost, tapped, sceneChanged, varChanged, the plugins' own) with the time since the scene opened and
   * their payload; the rules' lines (behaviour: a rule that ran; goto: a rule asking for another scene, with a link that
   * opens it – the stage stays); the plugins' `api.log` lines and their errors (the Code tab keeps its own log). Above
   * them, pinned and without a time, the **problems**: the Logic issues (errors and warnings – a click goes to the box in
   * the Logic panel) and the stored plugins that are not on the stage (a click opens the plugin in the Code tab) – a
   * section closed at first to its counts and first problem, so the timeline stays easy to walk. The
   * chips show only the kinds picked (kept in this browser); *clear* empties the timeline (the problems are a state – they
   * go when they are fixed). The top bar's *tap* taps a found target's AR content, so what follows shows below.
   */
  let { stage, experienceId, sceneId, onopenscene, ontab }: {
    stage: Stage | null; experienceId: string; sceneId: string;
    /** A goto's link: the workspace opens that scene */
    onopenscene?: (sceneId: string) => void;
    /** A problem's link: the workspace shows the Logic or the Code tab */
    ontab?: (tab: "logic" | "code") => void;
  } = $props();

  type Go = { logic: Context; node: string } | { plugin: string };

  const scene = $derived(content.scene(sceneId));
  /** A target takes a tap when it is found and shows AR content (the stage's live tree: an override, or the draft's) */
  const taps = $derived(tapTargets(scene?.entries ?? [], stage?.found ?? [], target => !!stage?.treeOf(target.id)));

  const source = logicContent(() => ({ experienceId, sceneId, stage }));
  const problems = $derived.by((): LogProblem<Go>[] => {
    const logic = issueRows(experienceProblems(source.logic)).map((row): LogProblem<Go> => ({
      kind: row.severity, place: row.place, text: row.text, message: row.message,
      go: row.node ? { logic: row.context ?? { level: "experience" }, node: row.node } : null,
    }));
    const failed = plugins.failed().map((f): LogProblem<Go> => ({
      kind: "error", place: f.id, text: f.error, message: `The plugin ${f.id} is not on the stage: ${f.error}`, go: { plugin: f.id },
    }));
    return [...failed, ...logic];
  });
  const entries = $derived(mergeLog(stage?.events ?? [], plugins.journal));

  let shown = $state<Set<LogKind>>(readLogFilter());
  const toggle = (kind: LogKind) => {
    shown = toggleLogKind(shown, kind);
    writeLogFilter(shown);
  };
  const counts = $derived(countKinds([...problems, ...entries]));
  const shownProblems = $derived(filterLog(problems, shown));
  const shownEntries = $derived(filterLog(entries, shown));

  const clear = () => {
    stage?.clearEvents();
    plugins.clearJournal();
  };
  const goTo = (go: Go) => {
    if ("plugin" in go) {
      plugins.focus = go.plugin;
      ontab?.("code");
    } else {
      logicFocus.ask(go.logic, go.node);
      ontab?.("logic");
    }
  };
  /** The scene a goto goes to (its detail is the address, `scene:<id>`) */
  const gotoScene = (detail: string) => {
    const address = parseAddress(detail);
    return address?.scheme === "scene" ? address.id : null;
  };
  const KIND_MARKS: Record<LogKind, string> = { event: "event", behaviour: "rule", plugin: "plugin", error: "error", warning: "warning" };
</script>

<div class="bar">
  <div class="row top" data-help="Taps a target's AR content without aiming at it, as a reader's tap would: the entity's onTap (a plugin component's, the animation's playOn: tap, a behaviour's tap rules) and the event targetTapped – what follows shows in the log below. Only a found target with AR content takes a tap.">
    <span class="label">tap</span>
    <span class="controls">
      {#each taps as t (t.id)}
        <button type="button" class="pill" disabled={!t.tappable} title={t.tappable ? `Tap ${t.label}` : `${t.label} is not found on the stage`} onclick={() => stage?.tap(t.id)}>{t.label}</button>
      {:else}
        <span class="small muted">none</span>
      {/each}
    </span></div>
  <div class="row top" data-help="Shows only the kinds picked: the stage's events, the rules' lines (behaviour, goto), the plugins' api.log lines and errors, and the problems – the Logic panel's errors and warnings and the plugins not on the stage. Kept in this browser. Clear empties the timeline; the problems stay until they are fixed.">
    <span class="label">show</span>
    <span class="controls">
      {#each LOG_KINDS as kind (kind)}
        <button type="button" class="pill framed chip" class:on={shown.has(kind)} aria-pressed={shown.has(kind)} onclick={() => toggle(kind)}
          title="{shown.has(kind) ? 'Hide' : 'Show'} the {LOG_KIND_LABELS[kind]}">{LOG_KIND_LABELS[kind]} <span class="count">{counts[kind]}</span></button>
      {/each}
      <button type="button" class="text-link" disabled={!entries.length} onclick={clear} title="Empty the timeline (the problems stay until they are fixed)">clear</button>
    </span></div>
</div>

{#if shownProblems.length}
  <Section id="log.problems" label="problems" open={false} summary={problemsSummary(shownProblems)}
    help="The problems as they are now, not timed: the Logic panel's errors and warnings for the whole experience (a click opens the Logic panel at the box) and the stored plugins that are not on the stage (a click opens the plugin in the Code tab). They go when they are fixed.">
    <ul class="problems" aria-label="Problems">
      {#each shownProblems as p, i (i)}
        <li>
          <button type="button" class="line problem" title={p.message} disabled={!p.go} onclick={() => p.go && goTo(p.go)}>
            <span class="at"></span>
            <span class="kind danger">{KIND_MARKS[p.kind]}</span>
            <span class="detail">{#if p.place}<strong>{p.place}</strong> {/if}{p.text}</span>
          </button>
        </li>
      {/each}
    </ul>
  </Section>
{/if}

<Section id="log.timeline" label="timeline" summary={shownEntries.length ? `${shownEntries.length} · ${shownEntries[0].line}` : "empty"}
  help="What happened on the stage, newest first: the time since the scene opened, a kind (event, rule, plugin), the line and its detail. A goto's link opens that scene. Clear above empties it.">
  {#if shownEntries.length}
    <ol class="timeline" aria-label="Log">
      {#each shownEntries as e, i (i)}
        {@const to = e.line === "goto" ? gotoScene(e.detail) : null}
        <li class="line">
          <span class="at muted">{e.at === null ? "" : formatElapsed(e.at)}</span>
          <span class="kind" class:muted={!e.failed} class:danger={e.failed}>{KIND_MARKS[e.kind]}</span>
          <span class="detail">{#if e.kind !== "plugin"}<strong>{e.line}</strong> {/if}{#if to}<button type="button" class="text-link" disabled={!content.scene(to) || to === sceneId}
              onclick={() => onopenscene?.(to)} title="The stage does not follow a goto – open the scene">open {content.scene(to)?.label || to}</button>{:else}<span class:muted={e.kind !== "plugin"} class:danger={e.failed} class:code={e.kind === "plugin"}>{e.detail}</span>{/if}</span>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="small muted empty">{entries.length ? "Nothing of the kinds picked." : stage ? "Nothing yet – find a target, tap it, run a plugin." : "The stage is not running."}</p>
  {/if}
</Section>

<style>
  .bar { flex-shrink: 0; border-bottom: 1px solid var(--line); padding-bottom: .25rem; margin-bottom: .25rem; }
  .row.top { align-items: start; }
  .row.top > .label { line-height: var(--control-height); }
  .chip .count { color: inherit; opacity: .7; font-variant-numeric: tabular-nums; }
  .problems, .timeline { flex-shrink: 0; list-style: none; margin: 0; padding: 0; font-size: var(--text-small); }
  .line { display: grid; grid-template-columns: 4.25rem 3.25rem minmax(0, 1fr); gap: .375rem; align-items: baseline; padding: .0625rem 0; }
  .problem { width: 100%; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .problem:disabled { cursor: default; }
  .at { font-variant-numeric: tabular-nums; text-align: right; }
  .kind { white-space: nowrap; }
  .detail { overflow-wrap: anywhere; min-width: 0; }
  .code { font-family: ui-monospace, Consolas, monospace; white-space: pre-wrap; }
  .empty { margin: .25rem 0; }
</style>
