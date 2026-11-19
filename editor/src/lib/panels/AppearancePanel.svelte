<script lang="ts">
  import { untrack } from "svelte";
  import { autosave } from "#lib/autosave.svelte.js";
  import { baselineOf, differsFromBaseline, noteBaseline } from "#lib/baselines.js";
  import { MOMENTS, type ExperienceAppearance, type Moment, type PassData } from "@engine/types";
  import { putExperienceAppearance } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import type { Stage } from "#lib/stage/stage.svelte.js";
  import {
    appearanceHeading, appearanceToSave, draftAppearance, inheritLabel, lookSource, momentSummary, playedLook, playedType, sameAppearance, setLook, setLookValue,
  } from "#lib/appearance-edit.js";
  import { liveLookChoices, lookPluginOf, lookSpecOf } from "#lib/plugin-appearances.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { helpName, lookRows, passOptionLabels, passValue, type ValueRow } from "#lib/values.js";
  import ColourField from "#lib/components/ColourField.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Section from "#lib/components/Section.svelte";
  import TextureField from "#lib/components/TextureField.svelte";
  import Toggle from "#lib/components/Toggle.svelte";

  /**
   * How the experience's entities **appear** (#265, `experience.appearance`): a look per moment – the first find (`reveal`), every
   * later find (`found`), the lost page (`lost`) –, each a collapsible section with a look picker (the built-in looks and
   * the looks of the experience's plugins: recorded, loaded on the stage or run in the Code tab, `plugins.version`) and the
   * rows of the look it plays from its spec. A moment without a look of its own plays `found`'s, then the default – its
   * rows show that look's values, and the first change makes the moment its own (a copy of the look that played, with the
   * change); closed, its head names the look and its values set. Experience-level: every scene shares it. A change plays on the stage at once – the
   * stage's next animations take the panel's looks, and each moment's *play* shows it on the shown targets – and reaches
   * the draft by itself a moment later (`PUT …/appearance`, #259). *Undo edits* takes it back to how the draft had it
   * before the first edit in this page. The model is `PassesPanel.svelte`; the logic `appearance-edit.ts`.
   */
  let { stage, experienceId }: { stage: Stage | null; experienceId: string } = $props();

  /** The draft's looks (a copy) – what a changed row is compared with */
  const saved = $derived<ExperienceAppearance>(draftAppearance(content.experienceAppearance));

  let edit = $state<ExperienceAppearance>({});
  /** The draft looks the panel started from (by identity: a reload makes new ones) */
  let seen = $state<{ id: string; appearance: ExperienceAppearance | null; draft: ExperienceAppearance } | null>(null);

  /** The experience's looks as a subject of the autosaver and of *Undo edits* */
  const key = $derived(`appearance:${experienceId}`);
  const canUndo = $derived(differsFromBaseline(key, edit));
  /** What the picker offers: built in, then each plugin's (a Code tab Run adds its looks at once) */
  const choices = $derived.by(() => { void plugins.version; void content.experienceAppearance; return liveLookChoices(); });
  const builtIns = $derived(choices.filter(choice => !choice.plugin));
  /** Why a look the draft names is not offered: the code loading, a source failed, or nobody registers it (#269) */
  const missing = $derived(plugins.missingNote());
  const byPlugin = $derived([...new Set(choices.filter(choice => choice.plugin).map(choice => choice.plugin!))]
    .map(plugin => ({ plugin, choices: choices.filter(choice => choice.plugin === plugin) })));
  /** Per moment: its look, its rows, where the look comes from and its words (the registry follows a Run) */
  const moments = $derived.by(() => {
    void plugins.version;
    return MOMENTS.map(moment => {
      const look = edit[moment];
      /** What plays: the look's rows are shown for it, own or not */
      const played = playedLook(edit, moment);
      const rows = lookRows(played, moment);
      return {
        moment, look, played, rows, source: lookSource(edit, moment), summary: momentSummary(edit, moment, rows),
        plugin: look ? lookPluginOf(look.type) : null, description: look ? lookSpecOf(look.type)?.description : undefined,
        known: !look || choices.some(choice => choice.type === look.type),
      };
    });
  });

  /** What the moment is, for its help */
  const MOMENT_HELP: Record<Moment, string> = {
    reveal: "The first find of a target: the entity appears for the first time and its entry is unlocked with it.",
    found: "Every later find of a target – and the first one too, while reveal has no look of its own.",
    lost: "The page is lost: the entity disappears – its look plays rewound, in the look's disappear time.",
  };

  // The draft arriving or reloading: start from the draft – unless this experience has unsaved edits
  $effect(() => {
    const id = experienceId;
    const appearance = content.experienceAppearance;
    const previous = seen;
    if (previous && previous.id === id && previous.appearance === appearance) return;
    const switching = !previous || previous.id !== id;
    // Edited = the panel's looks differ from the draft they started from (not from the one arriving now)
    const edited = !!previous && !sameAppearance(untrack(() => edit), previous.draft);
    seen = { id, appearance, draft: draftAppearance(appearance) };
    if (!switching && edited) return;
    edit = draftAppearance(appearance);
    // A stage that played the panel's looks plays the draft's now (its frame may hold an older draft)
    if (previous) untrack(() => stage)?.overrideAppearance(appearanceToSave(edit));
  });

  /** An edit: on the stage at once, in the draft a moment after the last one */
  const apply = (next: ExperienceAppearance) => {
    edit = next;
    const looks = appearanceToSave($state.snapshot(next) as ExperienceAppearance);
    stage?.overrideAppearance(looks);
    const experience = experienceId;
    noteBaseline(key, saved);
    autosave.queue(key, async () => {
      // Compared with the draft as it is when the save runs (an earlier save may have changed it)
      if (sameAppearance(looks, content.experienceAppearance)) return;
      await putExperienceAppearance(experience, looks);
      // The draft holds the looks; the stage plays them already (its override), so nothing is built again
      await content.load(experience);
    });
  };
  const choose = (moment: Moment, type: string) => apply(setLook(edit, moment, type || null));
  const set = (moment: Moment, row: ValueRow, value: number | string) => apply(setLookValue(edit, moment, row, value));
  /** Undo edits: the looks as the draft had them before the first edit in this page – saved like any edit */
  const revert = () => {
    const before = baselineOf<ExperienceAppearance>(key);
    if (before !== undefined) apply(draftAppearance(before));
  };
  /** A row's value as the draft has it – the default when the draft's look is another one */
  const savedValue = (moment: Moment, row: ValueRow) => {
    const look = playedLook(saved, moment);
    return look.type === playedLook(edit, moment).type ? passValue(look as PassData, row) : row.default;
  };
</script>

<Section id="stage.appearance" label={appearanceHeading(edit)} open={false}
  help="How the experience's AR entities appear and disappear: a look for the first find (reveal), every later find (found) and the lost page (lost) – a built-in look with its values, or a look of the experience's plugins. It is the experience's: every scene plays it. A change plays on the stage at once – play in a moment's head shows it – and reaches the draft by itself.">
{#each moments as { moment, look, played, rows, source, summary, plugin, description, known } (moment)}
  <Section id="stage.appearance.{moment}" label={moment} {summary} open={false} nested
    help={`${MOMENT_HELP[moment]} ${look ? (description ? (plugin ? `${description} – a look of the plugin ${plugin}.` : description) : `A plugin's look that is not registered on the stage (${missing}) – the Code tab says why, or pick another.`) : source === "found" ? "It has no look of its own: it plays found's." : "It has no look of its own: it plays the default look."}`}>
    {#snippet aside()}
      {#if plugin}<span class="small muted plugin" title="A look of the plugin {plugin}">{plugin}</span>{/if}
      <button type="button" class="icon-button" aria-label="Play {moment}" title="Play the {moment} look on the stage's targets" disabled={!stage} onclick={() => stage?.playMoment(moment)}><Icon name="play" /></button>
    {/snippet}
    <div class="row" data-help-name="{moment} · look" data-help={moment === "found"
      ? "The look every later find plays – and the first find and the lost page too, while they have none of their own. Default plays the default look."
      : `The look this moment plays. As found plays found's look (now ${playedType({ found: edit.found }, "found")}).`}>
      <span class="label sub">look</span>
      <span class="controls">
        <select class="field" aria-label="{moment} look" value={look?.type ?? ""} onchange={e => choose(moment, (e.currentTarget as HTMLSelectElement).value)}>
          <option value="">{inheritLabel(moment)}</option>
          {#each builtIns as choice (choice.type)}<option value={choice.type} title={choice.spec.description}>{choice.type}</option>{/each}
          {#each byPlugin as group (group.plugin)}
            <optgroup label={group.plugin}>
              {#each group.choices as choice (choice.type)}<option value={choice.type} title={choice.spec.description}>{choice.type}</option>{/each}
            </optgroup>
          {/each}
          {#if look && !known}<option value={look.type} title={plugins.failed().map(f => `${f.id}: ${f.error}`).join("\n")}>{look.type} ({missing})</option>{/if}
        </select>
      </span>
    </div>
    {#if rows.length}
      {#each rows as row (row.id)}
        <!-- The parameter's words (#173): its spec's label, else its name split into words -->
        <div class="row" class:changed={passValue(played as PassData, row) !== savedValue(moment, row)} data-help-name="{moment} · {helpName(row)}" data-help="{row.description} – default {row.default === '' ? 'none' : row.default}">
          <span class="label sub">{row.label}</span>
          {#if row.kind === "choice"}
            <span class="controls"><Segmented options={row.options ?? []} value={String(passValue(played as PassData, row))} labels={passOptionLabels(played as PassData, row)} onchange={v => set(moment, row, v)} /></span>
          {:else if row.kind === "boolean"}
            <span class="controls"><Toggle on={passValue(played as PassData, row) === "true"} label={row.label} onchange={value => set(moment, row, value ? "true" : "false")} /></span>
          {:else if row.kind === "string"}
            <input class="field" value={String(passValue(played as PassData, row))} aria-label={row.label} oninput={e => set(moment, row, (e.currentTarget as HTMLInputElement).value)} />
          {:else if row.kind === "texture"}
            <TextureField value={String(passValue(played as PassData, row))} label={row.label} onchange={v => set(moment, row, v)} />
          {:else if row.kind === "color"}
            <ColourField value={String(passValue(played as PassData, row))} label={row.label} onchange={hex => set(moment, row, hex)} />
          {:else}
            <span class="w"><ScrubNumber value={Number(passValue(played as PassData, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
              unit={row.unit ?? ""} label={row.label} strict={row.strict} oninput={v => set(moment, row, v)} /></span>
          {/if}
        </div>
      {/each}
    {/if}
  </Section>
{/each}
{#if canUndo}
  <div class="actions">
    <button type="button" class="text-link" onclick={revert} data-help-name="Undo edits"
      data-help="Edits reach the draft by themselves, a moment after the last change. Undo edits takes the experience's appearance back to how the draft had it before its first edit since this page was opened.">Undo edits</button>
  </div>
{/if}
</Section>

<style>
  .w { width: 6rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .label.sub { padding-left: .5rem; }
  .plugin { max-width: 6rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* A narrow panel keeps the head's room for the look's values: the plugin is named in the help */
  @container panel (max-width: 26rem) { .plugin { display: none; } }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
</style>
