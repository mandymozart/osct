<script lang="ts">
  import { untrack } from "svelte";
  import { getAssets, getEntityRef, getTargetsUsingEntity } from "@engine/content/game-config";
  import { ENTITY_TYPES, FILTER_TYPES, type AssetData, type EntityData, type EntityType, type FilterType, type Target } from "@engine/types";
  import { ApiError, putEntity, putTarget, putTargetEntity, type PrintPlacement } from "$lib/api";
  import { content } from "$lib/content.svelte";
  import { ACCEPT, library, NODE_ASSET_KINDS } from "$lib/library.svelte";
  import { plugins } from "$lib/plugins.svelte";
  import { Stage } from "$lib/stage/stage.svelte";
  import {
    addChild, addComponent, addFilter, componentTypesFor, contentTree, getValue, hasUniformScale, newNode, nodeAt, removeComponent, removeFilter,
    sameValue, setValue, valueRows, withNode, type ValueRow,
  } from "$lib/values";
  import type { NodeTimeline } from "@engine/types";
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
  let { stage, bookId, spreadId, selected = $bindable(), node = $bindable([]), pickColour, onlibrary, ontargetchanged }: {
    stage: Stage | null; bookId: string; spreadId: string; selected: string | null; node: number[];
    /** Pick a colour from the stage (the workspace owns the picking overlay) */
    pickColour?: () => Promise<string | null>;
    /** Open the library (to choose a file for the selected node) */
    onlibrary?: () => void;
    /** The target's image or print placement changed in the draft: reload the content and the stage */
    ontargetchanged?: () => Promise<void>;
  } = $props();

  $effect(() => {
    if (library.bookId !== bookId) void library.load(bookId);
  });

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
    entity = override === Stage.REMOVED ? null : override ?? t.entity ?? null;
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
  // The uniform-scale switch follows the selected node (not every value change: the author may unlink equal axes)
  $effect(() => {
    const path = node.join(".");
    const t = editingTarget;
    void path;
    void t;
    const n = untrack(() => current);
    if (n) uniformScale = hasUniformScale(n);
  });
  // The stage's override is the shared source of the live tree (the gizmo writes it too): follow it
  $effect(() => {
    const t = target;
    const live = t ? stage?.overrides.get(t.id) : undefined;
    if (!t || !live || !untrack(() => editingTarget === t.id)) return;
    if (live === Stage.REMOVED) {
      if (untrack(() => entity !== null)) entity = null;
    } else if (untrack(() => entity !== live)) entity = live;
  });
  /** The same node in the draft (undefined for a node the draft does not have yet) */
  const draftNode = $derived(target?.entity ? nodeAt(target.entity, node) : undefined);

  // The rows and the addable components follow the registry: a plugin's Run registers new types
  const rows = $derived.by(() => { void plugins.version; return current ? valueRows(current, uniformScale) : []; });
  const addable = $derived.by(() => { void plugins.version; return current ? componentTypesFor(current.type) : []; });
  const ref = $derived(target ? getEntityRef(target.id) : undefined);
  const source = $derived(ref ? `shared: ${ref} (${getTargetsUsingEntity(ref).length}×)` : target ? `entry: ${target.entryId}` : "");
  const dirty = $derived(!!target && JSON.stringify(entity ? contentTree(entity) : null) !== JSON.stringify(target.entity ? contentTree(target.entity) : null));

  const changed = (row: ValueRow) => !!current && (!draftNode || !sameValue(getValue(current, row), getValue(draftNode, row)));
  const anyChanged = (ids: ValueRow[]) => ids.some(changed);
  const pathLabel = $derived(node.length ? `root › ${node.join(" › ")}` : "root");

  const apply = (next: EntityData) => {
    entity = next;
    saved = null;
    if (target) stage?.override(target.id, next);
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

  // ── the target: its printed image and placement ──
  let targetImageInput = $state<HTMLInputElement>();
  let nodeFileInput = $state<HTMLInputElement>();
  let printOpen = $state(false);
  let targetBusy = $state(false);
  let targetError = $state<string | null>(null);
  let print = $state<PrintPlacement>({ surface: "right", x: 40, y: 60, width: 80 });
  /** The surfaces this spread has: the pages of the open book, or the cover's face */
  const surfaces = $derived.by<readonly PrintPlacement["surface"][]>(() => {
    const format = stage?.format() ?? "spread";
    return format === "cover" ? ["front"] : format === "back" ? ["back"] : ["left", "right"];
  });
  // The placement follows the target (its own print, else a default on the spread's first surface)
  $effect(() => {
    const t = target;
    const fallback = surfaces[surfaces.length - 1];
    print = t?.print ? { ...t.print } : { surface: fallback, x: 40, y: 60, width: 80 };
  });
  // While the placement rows are open the stage shows the edited place as a translucent image
  $effect(() => {
    const t = target;
    const open = printOpen;
    const where = { surface: print.surface, x: print.x, y: print.y, width: print.width };
    stage?.ghost(open && t ? { imageSrc: t.imageSrc, ...where } : null);
  });
  $effect(() => () => stage?.ghost(null));
  // The handles on the stage move the ghost: the placement rows follow
  $effect(() => {
    if (!stage || !printOpen) return;
    stage.onGhostChange = place => { print = { ...print, ...place }; };
    return () => { if (stage) stage.onGhostChange = null; };
  });
  const replaceTargetImage = async (file: File) => {
    if (!target) return;
    targetBusy = true;
    targetError = null;
    try {
      const asset = await library.upload(bookId, file);
      await putTarget(bookId, target.id, { imageSrc: asset.url });
      await ontargetchanged?.();
    } catch (e) {
      targetError = e instanceof ApiError ? e.message : String(e);
    } finally {
      targetBusy = false;
    }
  };
  const savePrint = async () => {
    if (!target) return;
    targetBusy = true;
    targetError = null;
    try {
      await putTarget(bookId, target.id, { print: { ...print, page: target.print?.page } });
      await ontargetchanged?.();
    } catch (e) {
      targetError = e instanceof ApiError ? e.message : String(e);
    } finally {
      targetBusy = false;
    }
  };
  /** A file uploaded for the selected node: the node takes it (live; Save writes it) */
  const uploadForNode = async (file: File) => {
    if (!current || !target) return;
    try {
      const asset = await library.upload(bookId, file);
      useAsset(asset.kind, asset.url, asset.id);
    } catch {
      // library.error says
    }
  };
  /** The selected node takes a file (the library's Use, an upload) */
  export const useAsset = (kind: AssetData["assetType"], src: string, assetId: string) => {
    if (!current || !target) return;
    const kinds = ASSET_KINDS[current.type];
    if (!kinds?.includes(kind)) return;
    applyNode({ ...current, assets: [{ id: `${target.id}-${assetId.slice(0, 8)}`, assetType: kind, src }] });
  };

  // ── the timeline of a model node (the animation component drives the same clip) ──
  // The scene builds a node once its model is loaded: the panel looks every frame until the timeline is there, then
  // reads its state every frame (the time runs)
  let timeline = $state<NodeTimeline | null>(null);
  let timelineState = $state<{ clip: string; time: number; playing: boolean; duration: number } | null>(null);
  $effect(() => {
    const t = target;
    const path = node;
    const s = stage;
    const wantsTimeline = current?.type === "model";
    timeline = null;
    timelineState = null;
    if (!t || !s || !wantsTimeline) return;
    let frame = 0;
    const tick = () => {
      const tl = s.timeline(t.id, path);
      if (tl !== timeline) timeline = tl;
      timelineState = tl ? tl.state() : null;
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  });
  const clipNames = $derived(timeline?.clips.map(c => c.name) ?? []);
  const fmt = (seconds: number) => `${seconds.toFixed(2)} s`;

  // ── + node ──
  let addType = $state<EntityType | "">("");
  let addAsset = $state("");
  const ASSET_KINDS = NODE_ASSET_KINDS;
  /** The files the new node may take: the library's of its kind, and the content's (deduplicated by src) */
  const assetChoices = $derived.by(() => {
    const kinds = ASSET_KINDS[addType];
    if (!kinds) return [];
    const seen = new Map<string, AssetData>();
    library.ofKinds(kinds).forEach(a => seen.set(a.url, { id: a.id, assetType: a.kind, src: a.url }));
    getAssets().filter(a => kinds.includes(a.assetType)).forEach(a => { if (!seen.has(a.src)) seen.set(a.src, a); });
    return [...seen.values()];
  });
  const fileLabel = (src: string) => library.byUrl(src)?.name ?? fileName(src);
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
    if (!entity || !target || !stage) return;
    // Through the stage (the tree's menu and the Delete key do the same): the override is the shared source
    node = stage.removeNode(target.id, node);
    saved = null;
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

  <div class="section"><span class="section-label">target · {target.id}</span>
    <span class="controls">
      <button type="button" class="text-link" onclick={() => targetImageInput?.click()} title="Upload another printed image for this target">Replace image…</button>
      <button type="button" class="text-link placement-toggle" class:on={printOpen} onclick={() => (printOpen = !printOpen)}>{printOpen ? "hide placement" : "placement"}</button>
    </span></div>
  <div class="row"><span class="label">image</span>
    <span class="controls file">
      <img class="target-thumb" src={target.imageSrc} alt="" />
      <span class="small muted name" title={target.imageSrc}>{fileLabel(target.imageSrc)}</span>
      <input bind:this={targetImageInput} type="file" accept=".jpg,.jpeg,.png,.webp" hidden
        onchange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void replaceTargetImage(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
    </span></div>
  {#if printOpen}
    <div class="row"><span class="label">surface</span>
      <span class="controls"><Segmented options={surfaces} value={print.surface} onchange={s => (print = { ...print, surface: s })} /></span></div>
    <div class="row"><span class="label">x · y</span>
      <span class="fields">
        <ScrubNumber value={print.x} min={0} max={230} step={1} fallback={0} prefix="X" unit="mm" label="printed x" oninput={v => (print = { ...print, x: v })} />
        <ScrubNumber value={print.y} min={0} max={320} step={1} fallback={0} prefix="Y" unit="mm" label="printed y" oninput={v => (print = { ...print, y: v })} />
      </span></div>
    <div class="row"><span class="label">width</span>
      <span class="controls">
        <span class="w"><ScrubNumber value={print.width} min={10} max={230} step={1} fallback={60} unit="mm" label="printed width" positive oninput={v => (print = { ...print, width: v })} /></span>
        <button type="button" class="pill" disabled={targetBusy} onclick={savePrint}>{targetBusy ? "Saving…" : "Save placement"}</button>
        {#if !target.print}<span class="small muted">from the book's layout until saved</span>{/if}
      </span></div>
  {/if}
  {#if targetError}<p class="small danger">{targetError}</p>{/if}

  <div class="section"><span class="section-label">node · {pathLabel}{current ? ` · ${current.type}` : ""}</span>
    <span class="controls">
      {#if entity}<button type="button" class="text-link" onclick={remove} title="Delete removes the selected node too">{node.length ? "remove node" : "remove entity"}</button>{/if}
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
          {#each assetChoices as a (a.src)}<option value={a.src}>{fileLabel(a.src)}</option>{/each}
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

    {#if ASSET_KINDS[current.type]}
      <div class="section"><span class="section-label">file</span>
        <span class="controls">
          <button type="button" class="text-link" onclick={() => nodeFileInput?.click()} title="Upload a file for this node">Upload…</button>
          {#if onlibrary}<button type="button" class="text-link" onclick={onlibrary} title="Choose a file from the library (Use)">Library…</button>{/if}
          <input bind:this={nodeFileInput} type="file" accept={ACCEPT} hidden
            onchange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void uploadForNode(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
        </span></div>
      <div class="row"><span class="label">{current.type === "model" ? "model" : current.type}</span>
        <span class="small muted name" title={current.assets[0]?.src ?? ""}>{current.assets[0] ? fileLabel(current.assets[0].src) : "no file"}</span></div>
    {/if}
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
    {#each current.components ?? [] as component, i (i)}
      <div class="section"><span class="section-label">components[{i}] {component.type}</span>
        <button type="button" class="text-link" onclick={() => current && applyNode(removeComponent(current, i))}>remove</button></div>
      {#if component.type === "animation" && timeline}
        <!-- The timeline: the model's clips, play / pause, the time – it drives the same clip the component plays -->
        <div class="row" title="The model's animation clips (glTF)">
          <span class="label">timeline</span>
          <span class="controls">
            <button type="button" class="icon-button framed" title={timelineState?.playing ? "Pause" : "Play"} aria-label={timelineState?.playing ? "Pause" : "Play"}
              onclick={() => (timelineState?.playing ? timeline?.pause() : timeline?.play())}><Icon name={timelineState?.playing ? "pause" : "play"} /></button>
            <span class="small muted tabular">{fmt(timelineState?.time ?? 0)} / {fmt(timelineState?.duration ?? 0)}</span>
          </span>
        </div>
        <div class="row"><span class="label"></span>
          <input class="time" type="range" min="0" max={timelineState?.duration ?? 0} step="0.01" value={timelineState?.time ?? 0} aria-label="Time in the clip"
            oninput={e => timeline?.seek(Number((e.currentTarget as HTMLInputElement).value))} />
        </div>
      {/if}
      {#each rows.filter(r => r.id.startsWith(`components.${i}.`)) as row (row.id)}
        {@const name = row.id.split(".")[2]}
        <div class="row" class:changed={changed(row)} title="{row.description} – default {row.default || '(first clip)'}">
          <span class="label">{name}</span>
          {#if row.kind === "choice"}
            <span class="controls"><Segmented options={row.options ?? []} value={String(getValue(current, row))} onchange={v => set(row, v)} /></span>
          {:else if row.kind === "boolean"}
            <span class="controls"><button type="button" class="pill" class:on={getValue(current, row) === "true"} aria-pressed={getValue(current, row) === "true"}
              onclick={() => set(row, getValue(current!, row) === "true" ? "false" : "true")}>{getValue(current, row) === "true" ? "on" : "off"}</button></span>
          {:else if row.kind === "string" && name === "clip" && clipNames.length}
            <select class="field" aria-label="Clip" value={String(getValue(current, row))} onchange={e => set(row, (e.currentTarget as HTMLSelectElement).value)}>
              <option value="">first clip ({clipNames[0]})</option>
              {#each clipNames as clip (clip)}<option value={clip}>{clip}</option>{/each}
            </select>
          {:else if row.kind === "string"}
            <input class="field" value={String(getValue(current, row))} aria-label={name} oninput={e => set(row, (e.currentTarget as HTMLInputElement).value)} />
          {:else if row.kind === "color"}
            <ColourField value={String(getValue(current, row))} label={row.id} onchange={hex => set(row, hex)} onpick={pickColour} />
          {:else}
            <span class="w"><ScrubNumber value={Number(getValue(current, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
              unit={row.unit ?? ""} label={row.id} strict={row.strict} oninput={v => set(row, v)} /></span>
          {/if}
        </div>
      {/each}
    {/each}
    {#if addable.length}
      <div class="section"><span class="section-label">add component</span>
        <span class="controls">
          {#each addable as type (type)}
            <button type="button" class="pill" disabled={!!current.components?.some(c => c.type === type)} onclick={() => current && applyNode(addComponent(current, type))}>+ {type}</button>
          {/each}
        </span></div>
    {/if}
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
  .axes .fields { flex: 1; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .link-slot { flex: none; width: var(--control-height); }
  .row > .field { width: 100%; }
  .tabular { font-variant-numeric: tabular-nums; }
  .time { width: 100%; margin: 0; accent-color: var(--text); }
  .file { flex-wrap: nowrap; }
  .target-thumb { width: 2.5rem; height: 1.875rem; object-fit: contain; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface-head); }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .text-link.on { color: var(--text); }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
