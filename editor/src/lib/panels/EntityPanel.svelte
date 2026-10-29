<script lang="ts">
  import { getEntityRef, getTarget, getTargets, getTargetsUsingEntity } from "@engine/content/game-config";
  import { FILTER_TYPES, type EntityData, type FilterType, type Target } from "@engine/types";
  import { ApiError, putEntity, putTargetEntity } from "$lib/api";
  import { content } from "$lib/content.svelte";
  import type { Stage } from "$lib/stage/stage.svelte";
  import {
    addFilter, contentEntity, getValue, hasUniformScale, removeFilter, sameValue, setValue, valueProblem, valueRows, type ValueRow,
  } from "$lib/values";
  import ScrubNumber from "$lib/components/ScrubNumber.svelte";
  import Segmented from "$lib/components/Segmented.svelte";

  /**
   * Every adjustable value of a target's entity – placement (three.js names, the three axes in one row as in
   * Blender) and each filter's parameters – as rows of one control height. Changes show live on the stage
   * (`stage.override`), the draft stays unchanged until **Save** writes the entity to the API (the shared entity when
   * the target refers to one, else the target's own). Rows come from the content contract's definitions.
   */
  let { stage, bookId, spreadId, selected = $bindable() }: { stage: Stage | null; bookId: string; spreadId: string; selected: string | null } = $props();

  const targets = $derived(getTargets(spreadId).filter(target => target.entity));
  const target = $derived<Target | undefined>(targets.find(t => t.id === selected) ?? targets.find(t => stage?.found.includes(t.id)) ?? targets[0]);

  let entity = $state<EntityData | null>(null);
  let uniformScale = $state(true);
  let saving = $state(false);
  let saved = $state<string | null>(null);
  let error = $state<string | null>(null);
  let hexProblem = $state<Record<string, string>>({});
  let editingTarget = $state<string | null>(null);

  // A new target (or a reload of the draft): start from the stage's override, else the content
  $effect(() => {
    const t = target;
    if (!t) {
      entity = null;
      editingTarget = null;
      return;
    }
    if (editingTarget === t.id && entity) return;
    editingTarget = t.id;
    const override = stage?.overrideOf(t.id);
    entity = override ?? t.entity!;
    uniformScale = hasUniformScale(entity);
    saved = null;
    error = null;
  });

  const rows = $derived(entity ? valueRows(entity, uniformScale) : []);
  const ref = $derived(target ? getEntityRef(target.id) : undefined);
  const source = $derived(ref ? `shared: ${ref} (${getTargetsUsingEntity(ref).length}×)` : target ? `entry: ${target.entryId}` : "");
  const dirty = $derived(!!entity && !!target?.entity && JSON.stringify(contentEntity(entity, uniformScale)) !== JSON.stringify(contentEntity(target.entity, hasUniformScale(target.entity))));

  const changed = (row: ValueRow) => !!entity && !!target?.entity && !sameValue(getValue(entity, row), getValue(target.entity, row));
  const anyChanged = (ids: ValueRow[]) => ids.some(changed);

  let frame = 0;
  const apply = (next: EntityData) => {
    entity = next;
    saved = null;
    const id = target?.id;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => id && stage?.override(id, next));
  };
  const set = (row: ValueRow, value: number | string) => entity && apply(setValue(entity, row, value));

  const revert = () => {
    if (!target) return;
    stage?.override(target.id, null);
    entity = target.entity!;
    uniformScale = hasUniformScale(entity);
    saved = null;
  };

  const save = async () => {
    if (!entity || !target) return;
    saving = true;
    error = null;
    try {
      const body = contentEntity(entity, uniformScale);
      if (ref) await putEntity(bookId, ref, body);
      else await putTargetEntity(bookId, target.id, body);
      // The draft now holds these values: reload it so the content's values (markers, revert) follow
      const id = target.id;
      await content.load(bookId);
      stage?.override(id, null);
      editingTarget = null;
      saved = ref ? `saved ${ref}` : `saved ${id}`;
    } catch (e) {
      error = e instanceof ApiError ? `${e.message} (${e.code})` : String(e);
    } finally {
      saving = false;
    }
  };

  const commitHex = (row: ValueRow, text: string) => {
    const problem = valueProblem(row, text);
    hexProblem = { ...hexProblem, [row.id]: problem ?? "" };
    if (!problem) set(row, text.trim().toLowerCase());
  };
</script>

{#if !entity || !target}
  <p class="muted">No target with AR content on this spread.</p>
{:else}
  <div class="head">
    <select class="field" aria-label="Target" value={target.id} onchange={e => (selected = (e.currentTarget as HTMLSelectElement).value)}>
      {#each targets as t (t.id)}
        <option value={t.id}>{stage?.found.includes(t.id) ? "◉ " : ""}{t.id} · {t.entity!.type}{stage?.overrideOf(t.id) ? " *" : ""}</option>
      {/each}
    </select>
    <span class="small muted">{source}</span>
  </div>

  <div class="section"><span class="section-label">placement</span>
    <button type="button" class="pill" class:on={uniformScale} aria-pressed={uniformScale} title="One scale for x, y and z"
      onclick={() => { uniformScale = !uniformScale; entity && apply(entity); }}>uniform scale</button></div>
  {#each ["position", "rotation", "scale"] as key (key)}
    {@const axes = rows.filter(r => r.id === key || r.id.startsWith(`${key}.`))}
    {#if axes.length}
      <div class="row" class:changed={anyChanged(axes)} title="{axes[0].description}{axes[0].unit ? ` (${axes[0].unit})` : ''} – default {axes.map(r => r.default).join(', ')}">
        <span class="label">{key}</span>
        <span class="fields">
          {#each axes as row (row.id)}
            {@const axis = row.id.split(".")[1]}
            <ScrubNumber value={Number(getValue(entity, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
              prefix={axis ? axis.toUpperCase() : ""} unit={row.unit === "°" ? "°" : ""} label={row.id} positive={row.id.startsWith("scale")}
              oninput={v => set(row, v)} />
          {/each}
        </span>
      </div>
    {/if}
  {/each}

  {#each entity.filters ?? [] as filter, i (i)}
    <div class="section"><span class="section-label">filters[{i}] {filter.type}</span>
      <button type="button" class="text-link" onclick={() => entity && apply(removeFilter(entity, i))}>remove</button></div>
    {#each rows.filter(r => r.id.startsWith(`filters.${i}.`)) as row (row.id)}
      <div class="row" class:changed={changed(row)} title="{row.description} – default {row.default}">
        <span class="label">{row.id.replace(/^filters\.\d+\./, "")}</span>
        {#if row.kind === "color"}
          <span class="color">
            <input type="color" value={String(getValue(entity, row))} aria-label="{row.id} picker" oninput={e => set(row, (e.currentTarget as HTMLInputElement).value)} />
            <input class="field" value={String(getValue(entity, row))} spellcheck="false" aria-label={row.id}
              onchange={e => commitHex(row, (e.currentTarget as HTMLInputElement).value)} />
            {#if hexProblem[row.id]}<span class="small danger">{hexProblem[row.id]}</span>{/if}
          </span>
        {:else if row.kind === "choice"}
          <span class="controls"><Segmented options={row.options ?? []} value={String(getValue(entity, row))} onchange={v => set(row, v)} /></span>
        {:else}
          <span class="w"><ScrubNumber value={Number(getValue(entity, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
            unit={row.unit ?? ""} label={row.id} strict={row.strict} oninput={v => set(row, v)} /></span>
        {/if}
      </div>
    {/each}
  {/each}
  {#if entity.type === "video"}
    <div class="section"><span class="section-label">add filter</span>
      <span class="controls">
        {#each FILTER_TYPES as type (type)}
          <button type="button" class="pill" onclick={() => entity && apply(addFilter(entity, type as FilterType))}>+ {type}</button>
        {/each}
      </span></div>
  {/if}

  <div class="actions">
    <button type="button" class="text-link" onclick={revert} disabled={!dirty}>Back to the draft</button>
    <span class="grow"></span>
    {#if saved}<span class="small muted">{saved}</span>{/if}
    {#if error}<span class="small danger">{error}</span>{/if}
    <button type="button" class="pill primary" onclick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</button>
  </div>
{/if}

<style>
  .head { display: flex; align-items: center; gap: .5rem; min-height: var(--control-height); }
  .head .field { max-width: 60%; }
  .head .small { overflow-wrap: anywhere; }
  .color { display: grid; grid-template-columns: var(--control-height) minmax(0, 1fr); gap: .375rem; align-items: center; }
  input[type=color] { width: var(--control-height); height: var(--control-height); border: 1px solid var(--line); border-radius: 50%; padding: 0; background: none; cursor: pointer; }
  input[type=color]::-webkit-color-swatch-wrapper { padding: .2rem; }
  input[type=color]::-webkit-color-swatch { border: none; border-radius: 50%; }
  .color .field { width: 100%; }
  .w { width: 6rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .fields :global(.scrub) { width: 100%; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
