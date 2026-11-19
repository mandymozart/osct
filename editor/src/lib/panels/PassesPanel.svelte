<script lang="ts">
  import { untrack } from "svelte";
  import { autosave } from "#lib/autosave.svelte.js";
  import { baselineOf, differsFromBaseline, noteBaseline } from "#lib/baselines.js";
  import { isPassEnabled, passBudgetWarning, type PassData } from "@engine/types";
  import { putExperiencePasses, putScene } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import {
    backToExperience, draftPasses, editInEffect, effectivePasses, movePass, ownPasses, passesHeading, passesSource, passSummary, pendingSaves,
    setPassEnabled, scenesOnExperience, type PassesDraft, type PassesSource,
  } from "#lib/passes-edit.js";
  import { sections } from "#lib/sections.svelte.js";
  import { livePassGroups, passPluginOf, passSpecOf } from "#lib/plugin-passes.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { helpName, passOptionLabels, passRows, passValue, setPassValue, type ValueRow } from "#lib/values.js";
  import ColourField from "#lib/components/ColourField.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Section from "#lib/components/Section.svelte";
  import ModelField from "#lib/components/ModelField.svelte";
  import TextureField from "#lib/components/TextureField.svelte";
  import Toggle from "#lib/components/Toggle.svelte";

  /**
   * The **post-processing**: the passes over the rendered image in order – the built-in bloom,
   * vignette and grade, and (#216) the passes of the experience's plugins, each with its rows from its spec. The
   * experience's passes are the master every scene shows; a scene uses them until it has its **own** (an override, starting
   * as a copy of the experience's; an empty list turns them off there), *back to the experience's* drops the override again. The list
   * shown is the one in effect – while the scene uses the experience's, editing it edits the experience's (every scene without its
   * own). The level is unmistakable (#181): the head names it ("post-processing · the whole experience" / "· only this scene"),
   * the line under it says what editing changes (all N scenes that use the experience's, or this scene's override) with the
   * switch to the other. Each pass is a collapsible section of its own (#233): closed, its
   * head names the type and its values set ("bloom · strength 0.35"); the head's toggle switches it on and off without
   * opening it (off keeps its place and values, the chain skips it), and it moves up and down in the list or goes. A
   * pass added opens. *add pass* offers the
   * built-in passes and each plugin's under its id – the declared plugins' (recorded, or loaded on the stage) and a plugin
   * run in the Code tab at once (`plugins.version`). A list beyond the phone budget says so (#86). Changes show live on
   * the stage (under *rendered*) and reach the draft by themselves a moment later (#259) – what changed: the experience's list
   * (`PUT …/passes`) and / or the scene's (`PUT …/scenes/{id}`); the stage keeps showing them, nothing is built again.
   * *Undo edits* takes both lists back to how the draft had them before the first edit in this page. A collapsible section of the Inspector's scene view,
   * closed on the first visit; the passes' descriptions are their help in the Info view.
   */
  let { stage, experienceId, sceneId, level = "scene" }: {
    stage: Stage | null; experienceId: string; sceneId: string;
    /** "experience": the experience's passes (behind the experience settings, #307 3c) – only the experience's list, every scene
     *  without its own shows it; "scene": the open scene's – its own override, or a link to make one */
    level?: "experience" | "scene";
  } = $props();
  const experienceLevel = $derived(level === "experience");
  /** Edit the list this panel is about: the experience's at the experience level, else the one in effect */
  const editList = (draft: PassesDraft, fn: (list: PassData[]) => PassData[]): PassesDraft =>
    experienceLevel ? { ...draft, experience: fn(draft.experience) } : editInEffect(draft, fn);

  const scene = $derived(content.scene(sceneId));
  /** The draft's lists: the experience's (the master) and the scene's own (null = the experience's apply) */
  const saved = $derived<PassesDraft>(draftPasses(content.experiencePasses, scene?.passes));

  let edit = $state<PassesDraft>({ experience: [], own: null });
  /** The draft lists the panel started from (by identity: a reload makes new ones) */
  let seen = $state<{ id: string; experience: PassData[] | null; own: PassData[] | undefined; draft: PassesDraft } | null>(null);

  const shown = $derived<PassData[]>(experienceLevel ? edit.experience : effectivePasses(edit));
  const source = $derived<PassesSource>(passesSource(edit));
  /** The lists as a subject of the autosaver and of *Undo edits* */
  const key = $derived(`passes:${experienceId}:${sceneId}`);
  const canUndo = $derived(differsFromBaseline(key, edit));
  /** The scenes editing the experience's list changes: every one without a list of its own, this one as it stands now */
  const onExperience = $derived(scenesOnExperience(content.scenes, sceneId, edit.own));
  /** The list in effect as the draft holds it – what a changed row is compared with */
  const savedShown = $derived<PassData[]>(experienceLevel || source === "experience" ? saved.experience : saved.own ?? saved.experience);
  /** What *add pass* offers, grouped: built in, then each plugin's (a Code tab Run adds its passes at once) */
  const groups = $derived.by(() => { void plugins.version; void content.experiencePasses; return livePassGroups(); });
  /** Per pass shown: its rows, the plugin it belongs to and its description (the registry follows a Run) */
  const passes = $derived.by(() => {
    void plugins.version;
    return shown.map((pass, i) => {
      const rows = passRows(pass, i);
      return { pass, rows, summary: passSummary(pass, rows), plugin: passPluginOf(pass.type), description: passSpecOf(pass.type)?.description };
    });
  });
  /** A pass's section: by its place in the list – a move or a removal carries the open state along */
  const passSection = (index: number) => `stage.passes.${index}`;
  const isPassOpen = (index: number) => sections.isOpen(passSection(index), false);
  const budget = $derived(passBudgetWarning(shown));

  // A scene switch, the draft arriving or reloading: start from the draft – unless the same scene has unsaved edits
  $effect(() => {
    const id = sceneId;
    const experience = content.experiencePasses;
    const own = scene?.passes;
    const previous = seen;
    if (previous && previous.id === id && previous.experience === experience && previous.own === own) return;
    const switching = !previous || previous.id !== id;
    // Edited = the panel's lists differ from the draft they started from (not from the one arriving now)
    const edited = !!previous && JSON.stringify(untrack(() => edit)) !== JSON.stringify(previous.draft);
    seen = { id, experience, own, draft: draftPasses(experience, own) };
    if (!switching && edited) return;
    edit = draftPasses(experience, own);
    // A live preview belongs to the scene it was made on
    if (previous && switching) untrack(() => stage)?.overridePasses(null);
  });

  /** An edit: live on the stage at once, in the draft a moment after the last one */
  const apply = (next: PassesDraft) => {
    edit = next;
    stage?.overridePasses($state.snapshot(experienceLevel && next.own !== null ? next.own : effectivePasses(next)) as PassData[]);
    const experience = experienceId;
    const id = sceneId;
    const lists = $state.snapshot(next) as PassesDraft;
    noteBaseline(key, saved);
    autosave.queue(key, async () => {
      // What differs from the draft as it is when the save runs (an earlier save may have changed it)
      const todo = pendingSaves(lists, draftPasses(content.experiencePasses, content.scene(id)?.passes));
      if (!Object.keys(todo).length) return;
      if ("experience" in todo) await putExperiencePasses(experience, todo.experience ?? null);
      if ("scene" in todo) await putScene(experience, id, { passes: todo.scene ?? null });
      // The draft holds the lists; the stage shows them already (its live passes), so nothing is built again
      await content.load(experience);
    });
  };
  const set = (index: number, row: ValueRow, value: number | string) =>
    apply(editList(edit, list => list.map((pass, i) => (i === index ? setPassValue(pass, row, value) : pass))));
  const add = (type: string) => {
    sections.setOpen(passSection(shown.length), true);
    apply(editList(edit, list => [...list, { type }]));
  };
  const remove = (index: number) => {
    for (let i = index; i < shown.length - 1; i++) sections.setOpen(passSection(i), isPassOpen(i + 1));
    sections.setOpen(passSection(shown.length - 1), false);
    apply(editList(edit, list => list.filter((_, i) => i !== index)));
  };
  const move = (index: number, by: number) => {
    const to = index + by;
    if (to >= 0 && to < shown.length) {
      const open = isPassOpen(index);
      sections.setOpen(passSection(index), isPassOpen(to));
      sections.setOpen(passSection(to), open);
    }
    apply(editList(edit, list => movePass(list, index, by)));
  };
  const switchPass = (index: number, on: boolean) => apply(editList(edit, list => setPassEnabled(list, index, on)));
  const choose = (next: PassesSource) => {
    if (next !== source) apply(next === "scene" ? ownPasses(edit) : backToExperience(edit));
  };
  /** Undo edits: both lists as the draft had them before the first edit in this page – saved like any edit */
  const revert = () => {
    const before = baselineOf<PassesDraft>(key);
    if (before) apply(before);
  };
</script>

<Section id={experienceLevel ? "experience.passes" : "stage.passes"} label={experienceLevel ? `post-processing${edit.experience.length ? "" : " · none"}` : passesHeading(edit).replace("the whole experience", "the experience's").replace("only this scene", "this scene")} open={false}
  help="The passes over the rendered image, in order – the look-around world and its sky included: the built-in ones and the passes of the experience's plugins. The head names the level: the whole experience – the experience's passes, the master every scene without its own shows – or only this scene – an override of its own. Changes show live on the stage (rendered shading) and reach the draft by themselves.">
{#if experienceLevel}
<div class="level" data-help-name="Level" data-help="The experience's passes: every scene without passes of its own shows them. A scene's own passes are set in its Inspector (Scene).">
  <span class="small">{onExperience === 1 ? "used by 1 scene" : `used by ${onExperience} scenes`} without their own</span>
</div>
{:else}
<div class="level" data-help-name="Level" data-help={source === "experience"
  ? "This scene shows the experience's passes (set behind the experience settings ⚙). Own for this scene gives it an override of its own, starting as a copy."
  : "This scene's own passes: they override the experience's here alone; removing every pass turns post-processing off here. Back to the experience's drops the override."}>
  <span class="small">{source === "experience" ? "the experience's passes" : "this scene's own passes"}</span>
  <span class="grow"></span>
  {#if source === "experience"}
    <button type="button" class="text-link" title="Own passes for this scene, starting as a copy of the experience's" onclick={() => choose("scene")}>own for this scene</button>
  {:else}
    <button type="button" class="text-link" title="Drop this scene's override: it shows the experience's passes again" onclick={() => choose("experience")}>back to the experience's</button>
  {/if}
</div>
{/if}
{#each passes as { pass, rows, summary, plugin, description }, i (i)}
  {@const on = isPassEnabled(pass)}
  <Section id={passSection(i)} label={pass.type} {summary} open={false} nested enabled={on} onenabled={next => switchPass(i, next)}
    enabledLabel="{pass.type} on or off"
    help={`${description ? (plugin ? `${description} – a pass of the plugin ${plugin}.` : description) : "A plugin's pass that no plugin of the experience registers here – Run its plugin in the Code tab, or remove it."} On or off in its head: off keeps the pass and its values in the list, the chain skips it.`}>
    {#snippet aside()}
      {#if plugin}<span class="small muted plugin" title="A pass of the plugin {plugin}">{plugin}</span>{/if}
      <button type="button" class="icon-button" aria-label="Move {pass.type} up" title="Earlier in the chain" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="up" /></button>
      <button type="button" class="icon-button" aria-label="Move {pass.type} down" title="Later in the chain" disabled={i === passes.length - 1} onclick={() => move(i, 1)}><Icon name="down" /></button>
      <button type="button" class="text-link" onclick={() => remove(i)}>remove</button>
    {/snippet}
  {#each rows as row (row.id)}
    <!-- The parameter's words (#173): its spec's label, else its name split into words -->
    <div class="row" class:changed={passValue(pass, row) !== (savedShown[i]?.type === pass.type ? passValue(savedShown[i], row) : row.default)} data-help-name="{pass.type} · {helpName(row)}" data-help="{row.description} – default {row.default === '' ? 'none' : row.default}">
      <span class="label sub">{row.label}</span>
      {#if row.kind === "choice"}
        <span class="controls"><Segmented options={row.options ?? []} value={String(passValue(pass, row))} labels={passOptionLabels(pass, row)} onchange={v => set(i, row, v)} /></span>
      {:else if row.kind === "boolean"}
        <span class="controls"><Toggle on={passValue(pass, row) === "true"} label={row.label} onchange={value => set(i, row, value ? "true" : "false")} /></span>
      {:else if row.kind === "string"}
        <input class="field" value={String(passValue(pass, row))} aria-label={row.label} oninput={e => set(i, row, (e.currentTarget as HTMLInputElement).value)} />
      {:else if row.kind === "texture"}
        <TextureField value={String(passValue(pass, row))} label={row.label} onchange={v => set(i, row, v)} />
      {:else if row.kind === "model"}
        <ModelField value={String(passValue(pass, row))} label={row.label} onchange={v => set(i, row, v)} />
      {:else if row.kind === "color"}
        <ColourField value={String(passValue(pass, row))} label={row.label} onchange={hex => set(i, row, hex)} />
      {:else}
        <span class="w"><ScrubNumber value={Number(passValue(pass, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
          unit={row.unit ?? ""} label={row.label} strict={row.strict} oninput={v => set(i, row, v)} /></span>
      {/if}
    </div>
  {/each}
  </Section>
{/each}
{#if budget}
  <div class="row" data-help-name="Phone budget" data-help="Every pass is a full-screen render on the phone, a bloom several: up to three passes and one bloom fit (#86). The content build warns too."><span class="small muted">{budget}</span></div>
{/if}
{#each groups as group, g (group.label)}
  <div class="row" data-help={group.plugin
    ? `Adds a pass of the plugin ${group.plugin} at the end of the list in effect: the experience's while the scene uses them, else the scene's own.`
    : "Adds a pass at the end of the list in effect: the experience's while the scene uses them, else the scene's own."}>
    <span class="label">{g === 0 ? "add pass" : ""}{#if group.plugin}<span class="muted">{g === 0 ? " · " : ""}{group.label}</span>{/if}</span>
    <span class="controls">
      {#each group.choices as choice (choice.type)}
        <button type="button" class="pill" title={choice.spec.description} onclick={() => add(choice.type)}>+ {choice.type}</button>
      {/each}
    </span></div>
{/each}
{#if canUndo}
  <div class="actions">
    <button type="button" class="text-link" onclick={revert} data-help-name="Undo edits"
      data-help="Edits reach the draft by themselves, a moment after the last change. Undo edits takes the post-processing – the experience's passes and this scene's own – back to how the draft had it before its first edit since this page was opened.">Undo edits</button>
  </div>
{/if}
</Section>

<style>
  .w { width: 6rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .label.sub { padding-left: .5rem; }
  .plugin { max-width: 6rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* A narrow panel keeps the head's room for the pass's values: the plugin is named in the help and under add pass */
  @container panel (max-width: 26rem) { .plugin { display: none; } }
  .level { display: flex; flex-wrap: wrap; align-items: center; gap: 0 .5rem; min-height: var(--control-height); flex-shrink: 0; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
