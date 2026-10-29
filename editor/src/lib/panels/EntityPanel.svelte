<script lang="ts">
  import { getAssets, getEntityRef, getTargetsUsingEntity } from "@engine/content/game-config";
  import { ENTITY_TYPES, FILTER_TYPES, type AssetData, type EntityData, type EntityType, type FilterType, type Target } from "@engine/types";
  import { ApiError, putEntity, putTargetEntity } from "$lib/api";
  import { content } from "$lib/content.svelte";
  import type { Stage } from "$lib/stage/stage.svelte";
  import {
    addChild, addFilter, contentTree, getValue, hasUniformScale, newNode, nodeAt, removeFilter, removeNode, sameValue, setValue, valueRows, withNode,
    type ValueRow,
  } from "$lib/values";
  import ColourField from "$lib/components/ColourField.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import ScrubNumber from "$lib/components/ScrubNumber.svelte";
  import Segmented from "$lib/components/Segmented.svelte";

  /**
   * The selected **node** of a target's entity (content schema 2.0: the entity is a tree; the tree panel or a tap
   * on the stage selects, `node` is the path from the root) – every adjustable value as rows of one control height:
   * placement (three.js names, the three axes in one row as in Blender), a text node's text and colour, each
   * filter's parameters. Changes show live on the stage (`stage.override` with the whole tree), the draft stays
   * unchanged until **Save** writes the entity to the API (the shared entity when the target refers to one, else the
   * target's own). **+ node** appends a child (group, model, video, image, text – files from the book's assets),
   * **remove node** drops the selected node and its children. Rows come from the content contract's definitions.
   */
  let { stage, bookId, spreadId, selected = $bindable(), node = $bindable([]), pickColour }: {
    stage: Stage | null; bookId: string; spreadId: string; selected: string | null; node: number[];
    /** Pick a colour from the stage (the workspace owns the picking overlay) */
    pickColour?: () => Promise<string | null>;
  } = $props();

  const targets = $derived((content.spread(spreadId)?.targets ?? []).filter(target => target.imageSrc));
  const target = $derived<Target | undefined>(targets.find(t => t.id === selected) ?? targets.find(t => t.entity && stage?.found.includes(t.id)) ?? targets.find(t => t.entity) ?? targets[0]);

  /** The whole tree being edited (null = the target has no entity yet) */
  let entity = $state<EntityData | null>(null);
  let uniformScale = $state(true);
  let saving = $state(false);
  let saved = $state<string | null>(null);
  let error = $state<string | null>(null);
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
    const other = editingTarget !== t.id;
    editingTarget = t.id;
    // The tree and the stage follow the target shown here (a fallback when nothing is selected yet)
    if (selected !== t.id) selected = t.id;
    const override = stage?.overrideOf(t.id);
    entity = override ?? t.entity ?? null;
    if (other) {
      node = [];
      saved = null;
      error = null;
    }
  });

  /** The selected node; a path the tree no longer has falls back to the root */
  const current = $derived<EntityData | null>(entity ? (nodeAt(entity, node) ?? entity) : null);
  $effect(() => {
    if (entity && !nodeAt(entity, node)) node = [];
  });
  // The uniform-scale switch follows the selected node
  $effect(() => {
    const n = current;
    const path = node.join(".");
    void path;
    if (n) uniformScale = hasUniformScale(n);
  });
  /** The same node in the draft (undefined for a node the draft does not have yet) */
  const draftNode = $derived(target?.entity ? nodeAt(target.entity, node) : undefined);

  const rows = $derived(current ? valueRows(current, uniformScale) : []);
  const ref = $derived(target ? getEntityRef(target.id) : undefined);
  const source = $derived(ref ? `shared: ${ref} (${getTargetsUsingEntity(ref).length}×)` : target ? `entry: ${target.entryId}` : "");
  const dirty = $derived(!!target && JSON.stringify(entity ? contentTree(entity) : null) !== JSON.stringify(target.entity ? contentTree(target.entity) : null));

  const changed = (row: ValueRow) => !!current && (!draftNode || !sameValue(getValue(current, row), getValue(draftNode, row)));
  const anyChanged = (ids: ValueRow[]) => ids.some(changed);
  const pathLabel = $derived(node.length ? `root › ${node.join(" › ")}` : "root");

  let frame = 0;
  const apply = (next: EntityData) => {
    entity = next;
    saved = null;
    const id = target?.id;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => id && stage?.override(id, next));
  };
  /** Replace the selected node in the tree */
  const applyNode = (next: EntityData) => entity && apply(withNode(entity, node, next));
  const set = (row: ValueRow, value: number | string) => current && applyNode(setValue(current, row, value));

  const revert = () => {
    if (!target) return;
    stage?.override(target.id, null);
    entity = target.entity ?? null;
    node = [];
    saved = null;
  };

  const afterSave = async (id: string, path: number[], label: string) => {
    // The draft now holds these values: reload it and build the spread again from it (markers, revert follow)
    await content.load(bookId);
    stage?.override(id, null);
    await stage?.refresh();
    editingTarget = null;
    node = path;
    saved = label;
  };

  const save = async () => {
    if (!target) return;
    saving = true;
    error = null;
    try {
      if (entity) {
        const body = contentTree(entity);
        if (ref) await putEntity(bookId, ref, body);
        else await putTargetEntity(bookId, target.id, body);
      } else {
        // No tree left: the target's entity is removed in the draft
        await putTargetEntity(bookId, target.id, null);
      }
      await afterSave(target.id, node, ref && entity ? `saved ${ref}` : `saved ${target.id}`);
    } catch (e) {
      error = e instanceof ApiError ? `${e.message} (${e.code})` : String(e);
    } finally {
      saving = false;
    }
  };

  // ── + node ──
  let addType = $state<EntityType | "">("");
  let addAsset = $state("");
  const ASSET_KINDS: Record<string, readonly AssetData["assetType"][]> = { model: ["glb", "gltf"], video: ["video"], image: ["image"] };
  /** The book's files of the kind the new node needs (deduplicated by src), from every entity the draft has */
  const assetChoices = $derived.by(() => {
    const kinds = ASSET_KINDS[addType];
    if (!kinds) return [];
    const seen = new Map<string, AssetData>();
    getAssets().filter(a => kinds.includes(a.assetType)).forEach(a => seen.set(a.src, a));
    return [...seen.values()];
  });
  const fileName = (src: string) => decodeURIComponent(src.split("/").pop() ?? src);
  const canAdd = $derived(!!addType && (!ASSET_KINDS[addType] || !!addAsset));
  const add = () => {
    if (!target || !canAdd) return;
    const chosen = assetChoices.find(a => a.src === addAsset);
    const child = newNode(addType as EntityType, chosen ? { id: `${target.id}-${Date.now().toString(36)}`, assetType: chosen.assetType, src: chosen.src } : undefined);
    if (!entity) {
      // The target's first node is the root
      apply(child);
      node = [];
    } else {
      const parent = nodeAt(entity, node) ? node : [];
      const index = nodeAt(entity, parent)?.children?.length ?? 0;
      apply(addChild(entity, parent, child));
      node = [...parent, index];
    }
    addType = "";
    addAsset = "";
  };
  const remove = () => {
    if (!entity || !target) return;
    if (!node.length) {
      // The root goes: the target shows no AR content until Save (or Back to the draft)
      entity = null;
      stage?.override(target.id, null);
      saved = null;
      return;
    }
    const parent = node.slice(0, -1);
    apply(removeNode(entity, node));
    node = parent;
  };
</script>

{#if !target}
  <p class="muted">No target on this spread.</p>
{:else}
  <div class="head">
    <select class="field" aria-label="Target" value={target.id} onchange={e => { selected = (e.currentTarget as HTMLSelectElement).value; node = []; }}>
      {#each targets as t (t.id)}
        <option value={t.id}>{stage?.found.includes(t.id) ? "◉ " : ""}{t.id}{t.entity ? ` · ${t.entity.type}` : " · no AR"}{stage?.overrideOf(t.id) ? " *" : ""}</option>
      {/each}
    </select>
    <span class="small muted">{source}</span>
  </div>

  <div class="section"><span class="section-label">node · {pathLabel}{current ? ` · ${current.type}` : ""}</span>
    <span class="controls">
      {#if entity}<button type="button" class="text-link" onclick={remove}>{node.length ? "remove node" : "remove entity"}</button>{/if}
    </span></div>
  <div class="row add"><span class="label">+ node</span>
    <span class="controls">
      <select class="field" aria-label="New node type" value={addType} onchange={e => { addType = (e.currentTarget as HTMLSelectElement).value as EntityType | ""; addAsset = ""; }}>
        <option value="">type…</option>
        {#each ENTITY_TYPES as type (type)}<option value={type}>{type}</option>{/each}
      </select>
      {#if addType && ASSET_KINDS[addType]}
        <select class="field grow" aria-label="File" value={addAsset} onchange={e => (addAsset = (e.currentTarget as HTMLSelectElement).value)}>
          <option value="">{assetChoices.length ? "file…" : "no file of this kind in the book"}</option>
          {#each assetChoices as a (a.src)}<option value={a.src}>{fileName(a.src)}</option>{/each}
        </select>
      {/if}
      <button type="button" class="icon-button framed" title={entity ? "Add as a child of the selected node" : "Add as the target's root node"} aria-label="Add node" disabled={!canAdd} onclick={add}><Icon name="plus" /></button>
    </span></div>

  {#if !entity || !current}
    <p class="muted small">No AR content on this target yet: add a root node above (a model, video, image or text, or a group to hold several).</p>
    <div class="actions">
      <button type="button" class="text-link" onclick={revert} disabled={!dirty}>Back to the draft</button>
      <span class="grow"></span>
      {#if saved}<span class="small muted">{saved}</span>{/if}
      {#if error}<span class="small danger">{error}</span>{/if}
      <button type="button" class="pill primary" onclick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</button>
    </div>
  {:else}
    <div class="section"><span class="section-label">placement</span></div>
    {#each ["position", "rotation", "scale"] as key (key)}
      {@const axes = rows.filter(r => r.id === key || r.id.startsWith(`${key}.`))}
      {#if axes.length}
        <div class="row" class:changed={anyChanged(axes)} title="{axes[0].description}{axes[0].unit ? ` (${axes[0].unit})` : ''} – default {axes.map(r => r.default).join(', ')}">
          <span class="label">{key}</span>
          <span class="axes">
            <span class="fields">
              {#each axes as row (row.id)}
                {@const axis = row.id.split(".")[1]}
                <ScrubNumber value={Number(getValue(current, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
                  prefix={axis ? axis.toUpperCase() : ""} unit={row.unit === "°" ? "°" : ""} label={row.id} positive={row.id.startsWith("scale")}
                  oninput={v => set(row, v)} />
              {/each}
            </span>
            {#if key === "scale"}
              <!-- The chain (Blender): pressed = one scale for x, y and z -->
              <button type="button" class="icon-button" class:on={uniformScale} aria-pressed={uniformScale} aria-label="Uniform scale"
                title={uniformScale ? "Uniform scale: one value for x, y and z – tap to scale per axis" : "Scale per axis – tap to link x, y and z"}
                onclick={() => { uniformScale = !uniformScale; current && applyNode(current); }}><Icon name="link" /></button>
            {:else}
              <span class="link-slot"></span>
            {/if}
          </span>
        </div>
      {/if}
    {/each}

    {#if current.type === "text"}
      <div class="section"><span class="section-label">text</span></div>
      <div class="row" class:changed={!draftNode || (draftNode.text ?? "") !== (current.text ?? "")} title="The line shown; {'{{entry.title}}'} and {'{{book.title}}'} are replaced">
        <span class="label">text</span>
        <input class="field" value={current.text ?? ""} spellcheck="false" aria-label="Text" oninput={e => current && applyNode({ ...current, text: (e.currentTarget as HTMLInputElement).value })} />
      </div>
      <div class="row" class:changed={!draftNode || (draftNode.color ?? "#ffffff") !== (current.color ?? "#ffffff")} title="The text's colour – default #ffffff">
        <span class="label">color</span>
        <ColourField value={current.color ?? "#ffffff"} label="Text colour" onchange={hex => current && applyNode({ ...current, color: hex })} onpick={pickColour} />
      </div>
    {/if}

    {#each current.filters ?? [] as filter, i (i)}
      <div class="section"><span class="section-label">filters[{i}] {filter.type}</span>
        <button type="button" class="text-link" onclick={() => current && applyNode(removeFilter(current, i))}>remove</button></div>
      {#each rows.filter(r => r.id.startsWith(`filters.${i}.`)) as row (row.id)}
        <div class="row" class:changed={changed(row)} title="{row.description} – default {row.default}">
          <span class="label">{row.id.replace(/^filters\.\d+\./, "")}</span>
          {#if row.kind === "color"}
            <ColourField value={String(getValue(current, row))} label={row.id} onchange={hex => set(row, hex)} onpick={pickColour} />
          {:else if row.kind === "choice"}
            <span class="controls"><Segmented options={row.options ?? []} value={String(getValue(current, row))} onchange={v => set(row, v)} /></span>
          {:else}
            <span class="w"><ScrubNumber value={Number(getValue(current, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
              unit={row.unit ?? ""} label={row.id} strict={row.strict} oninput={v => set(row, v)} /></span>
          {/if}
        </div>
      {/each}
    {/each}
    {#if current.type === "video"}
      <div class="section"><span class="section-label">add filter</span>
        <span class="controls">
          {#each FILTER_TYPES as type (type)}
            <button type="button" class="pill" onclick={() => current && applyNode(addFilter(current, type as FilterType))}>+ {type}</button>
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
{/if}

<style>
  .head { display: flex; align-items: center; gap: .5rem; min-height: var(--control-height); }
  .head .field { max-width: 60%; }
  .head .small { overflow-wrap: anywhere; }
  .add .controls { flex-wrap: nowrap; }
  .add .field { min-width: 0; max-width: 7rem; }
  .add .field.grow { flex: 1; max-width: none; }
  .w { width: 6rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .fields :global(.scrub) { width: 100%; }
  .axes { display: flex; align-items: center; gap: .25rem; min-width: 0; }
  .axes .fields { flex: 1; }
  .link-slot { flex: none; width: var(--control-height); }
  .row > .field { width: 100%; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
