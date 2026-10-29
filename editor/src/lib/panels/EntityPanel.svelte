<script lang="ts">
  import { untrack } from "svelte";
  import { getAssets, getEntityRef, getTargetsUsingEntity } from "@engine/content/game-config";
  import { ENTITY_TYPES, FILTER_TYPES, type AssetData, type EntityData, type EntityType, type FilterType, type Target } from "@engine/types";
  import { ApiError, putEntity, putTarget, putTargetEntity, type PrintPlacement } from "$lib/api";
  import { content } from "$lib/content.svelte";
  import { library, NODE_ASSET_KINDS } from "$lib/library.svelte";
  import { pickAccept, type LibraryPick } from "$lib/library-pick";
  import { plugins } from "$lib/plugins.svelte";
  import { Stage } from "$lib/stage/stage.svelte";
  import { fromOrigin, toOrigin } from "$lib/stage/origin";
  import { getPreview, subscribePreview } from "$lib/stage/preview";
  import {
    addComponent, addFilter, componentTypesFor, contentTree, getValue, hasUniformScale, newNode, nodeAt, removeComponent, removeFilter,
    sameValue, setValue, valueRows, withNode, type ValueRow,
  } from "$lib/values";
  import { selection } from "$lib/selection.svelte";
  import { breadcrumb } from "$lib/selection";
  import { ADD_PLACES, addNode, defaultAddPlace, nodeLabel, typeLabel, withName, type AddPlace } from "$lib/tree";
  import type { NodeTimeline } from "@engine/types";
  import ColourField from "$lib/components/ColourField.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import ScrubNumber from "$lib/components/ScrubNumber.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import FileField from "$lib/components/FileField.svelte";
  import LibraryPanel from "./LibraryPanel.svelte";

  /**
   * The selected **node** of a target's entity (content schema 2.0: the entity is a tree; the tree panel or a tap
   * on the stage selects, `node` is the path from the root) – every adjustable value as rows of one control height:
   * placement (three.js names, the three axes in one row as in Blender), a text node's text and colour, a light
   * node's values, each filter's and component's parameters. Changes show live on the stage (`stage.override` with
   * the whole tree), the draft stays unchanged until **Save** writes the entity to the API (the shared entity when
   * the target refers to one, else the target's own). **+ node** adds a node (group, model, video, image, text,
   * light – files from the book's assets) next to the selected one or inside it (#163), **remove node** drops the
   * selected node and its children. Rows come from the content contract's definitions (one `specRow` snippet draws a
   * parameter of any kind). It opens at the level of the workspace's selection (#162): a selected target shows its
   * target fields, its entity or a node that node's rows; the breadcrumb in the head steps up.
   */
  let { stage, bookId, spreadId, selected = $bindable(), node = $bindable([]), pickColour, ontargetchanged }: {
    stage: Stage | null; bookId: string; spreadId: string; selected: string | null; node: number[];
    /** Pick a colour from the stage (the workspace owns the picking overlay) */
    pickColour?: () => Promise<string | null>;
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
  /** The level of the selection (#162): the target's fields, or its entity / a node of it (a target without a tree: the target) */
  const atTarget = $derived(selection.onTarget || !entity);
  const crumbs = $derived(target ? breadcrumb({ target: target.id, node, onTarget: atTarget }, entity ?? undefined) : []);
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

  // ── the Library as the picker of a file (#164): opened for one field – the target's image, the node's file, the
  // new node's file – it fills only that one; the panel keeps its state underneath ──
  let picking = $state<LibraryPick | null>(null);
  const pickFor = (pick: Omit<LibraryPick, "oncancel">) => {
    picking = { ...pick, onpick: asset => { picking = null; return pick.onpick(asset); }, oncancel: () => (picking = null) };
  };
  // Another target or node selected (the tree, the stage) while picking: the field it was opened for is gone
  const pickContext = $derived(`${target?.id}|${node.join(".")}`);
  $effect(() => {
    void pickContext;
    untrack(() => (picking = null));
  });
  const pickTargetImage = () => {
    const t = target;
    if (t) pickFor({ subject: { for: "target-image" }, label: `the printed image of ${t.id}`, current: t.imageSrc, onpick: asset => setTargetImage(t.id, asset.url) });
  };
  const pickNodeFile = () => {
    const t = target;
    const type = current?.type;
    if (!t || !type) return;
    // The picker's head names the node as the tree does: its name, else where it sits (#170 – was "of node root")
    const which = current?.name ? `“${current.name}”` : node.length ? `node ${pathLabel}` : "the root node";
    pickFor({ subject: { for: "node", nodeType: type }, label: `the ${type} of ${which}`, current: current?.assets[0]?.src,
      onpick: asset => useAsset(asset.kind, asset.url, asset.id) });
  };
  const pickNewNodeFile = () => {
    const type = addType;
    if (type) pickFor({ subject: { for: "node", nodeType: type }, label: `the new ${type} node`, current: addAsset, onpick: asset => { addAsset = asset.url; } });
  };

  // ── the target: its printed image and placement ──
  let printOpen = $state(false);
  let targetBusy = $state(false);
  let targetError = $state<string | null>(null);
  let print = $state<PrintPlacement>({ surface: "right", x: 40, y: 60, width: 80 });
  // The x / y rows are read and entered from the stage's origin (Stage panel); `print` keeps the content's frame
  let origin = $state(getPreview().origin);
  $effect(() => subscribePreview(state => (origin = state.origin)));
  const frame = $derived({ page: stage?.pageFormat() ?? { width: 230, height: 320 }, format: stage?.format() ?? "spread" });
  const shown = $derived(toOrigin(origin, frame, print.surface, print.x, print.y));
  const setShown = (x: number, y: number) => (print = { ...print, ...fromOrigin(origin, frame, print.surface, x, y) });
  /** The shown place is where the book's layout prints the target (until saved), not one set in the editor */
  let placeFromLayout = $state(false);
  /** The surfaces this spread has: the pages of the open book, or the cover's face */
  const surfaces = $derived.by<readonly PrintPlacement["surface"][]>(() => {
    const format = stage?.format() ?? "spread";
    return format === "cover" ? ["front"] : format === "back" ? ["back"] : ["left", "right"];
  });
  /** The target's place in the book's layout; without one the ghost stays where it is */
  const placeFromBookLayout = (t: Target) => {
    const place = stage?.printedPlace(t.id) ?? null;
    placeFromLayout = !!place;
    if (place) print = place;
  };
  // The placement follows the target: its own print; else the book's layout while the placement is open
  $effect(() => {
    const t = target;
    if (t?.print) print = { ...t.print };
    else if (t && untrack(() => printOpen)) placeFromBookLayout(t);
  });
  const togglePlacement = () => {
    if (!printOpen && target && !target.print) placeFromBookLayout(target);
    printOpen = !printOpen;
  };
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
  /** The target's printed image becomes a library file (picked) or a new upload */
  const setTargetImage = async (targetId: string, src: string | File) => {
    targetBusy = true;
    targetError = null;
    try {
      const url = typeof src === "string" ? src : (await library.upload(bookId, src)).url;
      await putTarget(bookId, targetId, { imageSrc: url });
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
    // a file of the library (picked there or chosen here) brings its size: a video node is sized to it
    const child = newNode(addType as EntityType, chosen ? { id: `${target.id}-${Date.now().toString(36)}`, assetType: chosen.assetType, src: chosen.src } : undefined,
      chosen ? library.byUrl(chosen.src) : null);
    // The target's first node is the root; else next to the selected node or inside it
    const placed = addNode(entity, node, child, addPlace);
    apply(placed.tree);
    selection.selectNode(target.id, placed.path);
    addType = "";
    addAsset = "";
  };
  // Where "+ node" puts the new node (#163): chosen, else the default for the selected node (next to a file node)
  let addPlaceChosen = $state<AddPlace | null>(null);
  const addPlace = $derived<AddPlace>(addPlaceChosen ?? defaultAddPlace(current ?? undefined));
  const ADD_PLACE_LABELS: Record<AddPlace, string> = { next: "next to it", inside: "inside it" };
  $effect(() => {
    void node.join(".");
    void target?.id;
    untrack(() => (addPlaceChosen = null));
  });
  const remove = () => {
    if (!entity || !target || !stage) return;
    // Through the stage (the tree's menu and the Delete key do the same): the override is the shared source
    node = stage.removeNode(target.id, node);
    saved = null;
  };
</script>

{#snippet actions()}
  <div class="actions">
    <button type="button" class="text-link" onclick={revert} disabled={!dirty}>Back to the draft</button>
    <span class="grow"></span>
    {#if saved}<span class="small muted">{saved}</span>{/if}
    {#if error}<span class="small danger">{error}</span>{/if}
    <button type="button" class="pill primary" onclick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</button>
  </div>
{/snippet}

{#snippet specRow(row: ValueRow, name: string)}
  <!-- A parameter of a spec (a component's, the light's) by its kind: choice, on / off, string, colour, number -->
  {#if current}
    <div class="row" class:changed={changed(row)} title="{row.description} – default {row.default || (name === 'clip' ? '(first clip)' : row.default)}">
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
  {/if}
{/snippet}

{#if picking}
  <LibraryPanel {bookId} pick={picking} />
{:else if !target}
  <p class="muted">No target on this spread.</p>
{:else}
  <div class="head">
    <!-- The breadcrumb (#162): target › entity › group › node – a crumb selects that level; ▾ after the target picks another -->
    <nav class="crumbs" aria-label="Selected level">
      {#each crumbs as crumb, i (i)}
        {#if i}<span class="crumb-sep" aria-hidden="true">›</span>{/if}
        {#if crumb.current}
          <span class="crumb current" aria-current="true" title="Selected: the {crumb.level}">{crumb.label}</span>
        {:else}
          <button type="button" class="crumb" onclick={() => selection.set(crumb.selection)} title="Select the {crumb.level}">{crumb.label}</button>
        {/if}
        {#if !i}
          <select class="crumb-switch" aria-label="Target" title="Another target on this spread" value={target.id} onchange={e => selection.selectTarget((e.currentTarget as HTMLSelectElement).value)}>
            {#each targets as t (t.id)}
              <option value={t.id}>{stage?.found.includes(t.id) ? "◉ " : ""}{t.id}{t.entity ? ` · ${t.entity.type}` : " · no AR"}{stage?.overrideOf(t.id) ? " *" : ""}</option>
            {/each}
          </select>
        {/if}
      {/each}
    </nav>
    <span class="small muted">{source}</span>
  </div>

  {#if atTarget}
  <div class="section"><span class="section-label">target · {target.id}</span>
    <span class="controls">
      <button type="button" class="text-link placement-toggle" class:on={printOpen} onclick={togglePlacement}>{printOpen ? "hide placement" : "placement"}</button>
    </span></div>
  <div class="row"><span class="label">image</span>
    <FileField src={target.imageSrc} picture accept={pickAccept({ for: "target-image" })} label="the printed image of {target.id}"
      onlibrary={pickTargetImage} onupload={f => { const id = target?.id; if (id) void setTargetImage(id, f); }} /></div>
  {#if printOpen}
    <div class="row"><span class="label">surface</span>
      <span class="controls"><Segmented options={surfaces} value={print.surface} onchange={s => (print = { ...print, surface: s })} /></span></div>
    <div class="row"><span class="label">x · y</span>
      <span class="fields">
        <ScrubNumber value={shown.x} step={1} fallback={0} prefix="X" unit="mm" label="printed x" oninput={v => setShown(v, shown.y)} />
        <ScrubNumber value={shown.y} step={1} fallback={0} prefix="Y" unit="mm" label="printed y" oninput={v => setShown(shown.x, v)} />
      </span></div>
    <div class="row"><span class="label">width</span>
      <span class="controls">
        <span class="w"><ScrubNumber value={print.width} min={10} max={230} step={1} fallback={60} unit="mm" label="printed width" positive oninput={v => (print = { ...print, width: v })} /></span>
        <button type="button" class="pill" disabled={targetBusy} onclick={savePrint}>{targetBusy ? "Saving…" : "Save placement"}</button>
        {#if !target.print}<span class="small muted" data-help-name="Placement" data-help={placeFromLayout ? "Taken from the book's layout until you save a placement of this target's own." : "The target is not in the book's layout: its placement is set by hand and kept once saved."}>{placeFromLayout ? "from the layout" : "by hand"}</span>{/if}
      </span></div>
  {/if}
  {#if targetError}<p class="small danger">{targetError}</p>{/if}
  {/if}

  {#if !atTarget}
  <div class="section"><span class="section-label">{node.length ? "node" : "entity"}{current ? ` · ${current.type}` : ""}</span>
    <span class="controls">
      {#if entity}<button type="button" class="text-link" onclick={remove} title="Delete removes the selected node too">{node.length ? "remove node" : "remove entity"}</button>{/if}
    </span></div>
  {#if current}
    <div class="row" class:changed={(draftNode?.name ?? "") !== (current.name ?? "")} data-help-name="Name" data-help="The node's name in the tree – for the people who make the book; the reader does not show it. Empty: the tree shows the node's type.">
      <span class="label">name</span>
      <input class="field" value={current.name ?? ""} placeholder={typeLabel(current)} spellcheck="false" aria-label="Node name"
        oninput={e => current && applyNode(withName(current, (e.currentTarget as HTMLInputElement).value))} />
    </div>
  {/if}
  {/if}
  {#if !atTarget || !entity}
  <div class="row add" data-help="Adds a node of this type: with no AR content yet the target's root (a model, video, image, text or light, or a group to hold several), else next to the selected node or inside it (add as)."><span class="label">+ node</span>
    <span class="controls">
      <select class="field" aria-label="New node type" value={addType} onchange={e => { addType = (e.currentTarget as HTMLSelectElement).value as EntityType | ""; addAsset = ""; }}>
        <option value="">type…</option>
        {#each ENTITY_TYPES as type (type)}<option value={type}>{type}</option>{/each}
      </select>
      {#if addType && ASSET_KINDS[addType]}
        <button type="button" class="pill framed grow file-pick" title="Choose the new node's file in the Library" onclick={pickNewNodeFile}>{addAsset ? fileLabel(addAsset) : "file…"}</button>
      {/if}
      <button type="button" class="pill framed" title={!entity ? "Add as the target's root node" : addPlace === "next" ? "Add next to the selected node" : "Add inside the selected node"} disabled={!canAdd} onclick={add}>add</button>
    </span></div>
    {#if entity}
      <div class="row" data-help-name="Add as" data-help="Where + node puts the new node: next to the selected node (the same parent, right after it) or inside it (its last child). Next to it is the default for a model, video or image, which rarely hold children; next to the root, both go into a new group."><span class="label">add as</span>
        <span class="controls"><Segmented options={ADD_PLACES} value={addPlace} labels={ADD_PLACE_LABELS} onchange={place => (addPlaceChosen = place)} /></span></div>
    {/if}
  {/if}

  {#if !entity || !current}
    <p class="muted small">No AR content on this target yet.</p>
    <div class="actions">
      <button type="button" class="text-link" onclick={revert} disabled={!dirty}>Back to the draft</button>
      <span class="grow"></span>
      {#if saved}<span class="small muted">{saved}</span>{/if}
      {#if error}<span class="small danger">{error}</span>{/if}
      <button type="button" class="pill primary" onclick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</button>
    </div>
  {:else if atTarget}
    <!-- The target is selected: its entity is one step down -->
    <div class="row"><span class="label">AR content</span>
      <span class="controls"><button type="button" class="text-link" onclick={() => target && selection.selectNode(target.id, [])} title="Select the entity (its root node)">{nodeLabel(entity)}</button></span></div>
    {@render actions()}
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
      <div class="section"><span class="section-label">file</span></div>
      <div class="row"><span class="label">{current.type}</span>
        <FileField src={current.assets[0]?.src} picture={current.type === "image"} accept={pickAccept({ for: "node", nodeType: current.type })}
          label="the {current.type} file of this node" onlibrary={pickNodeFile} onupload={f => void uploadForNode(f)} /></div>
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
    {#if current.type === "light"}
      <div class="section"><span class="section-label">light</span></div>
      {#each rows.filter(r => r.id.startsWith("light.")) as row (row.id)}
        {@const name = row.id.split(".")[1]}
        {@const spotOnly = (name === "angle" || name === "penumbra") && getValue(current, { ...row, id: "light.kind" }) !== "spot"}
        {@const noReach = (name === "distance" || name === "decay") && getValue(current, { ...row, id: "light.kind" }) === "directional"}
        {#if !spotOnly && !noReach}
          {@render specRow(row, name)}
        {/if}
      {/each}
    {/if}

    {#each current.filters ?? [] as filter, i (i)}
      <div class="section"><span class="section-label">filter {i + 1} · {filter.type}</span>
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
      <div class="section"><span class="section-label">component · {component.type}</span>
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
        {@render specRow(row, row.id.split(".")[2])}
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
  .head .small { overflow-wrap: anywhere; }
  /* The breadcrumb: the crumbs as quiet buttons, the selected level marked as in the tree; ▾ picks another target */
  .crumbs { flex: 1; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 0 .125rem; }
  .crumb { max-width: 10rem; height: var(--control-height); padding: 0 .375rem; border: none; border-radius: var(--control-radius); background: none; color: var(--muted);
    cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  button.crumb:hover { background: var(--hover-background); color: var(--text); }
  .crumb.current { display: inline-flex; align-items: center; background: var(--selected-background); color: var(--pressed-color); cursor: default; }
  .crumb-sep { color: var(--muted); }
  /* Only the select's arrow shows (its options name the targets) */
  .crumb-switch { width: 1.25rem; height: var(--control-height); padding: 0; border: none; border-radius: var(--control-radius); color: transparent; cursor: pointer; appearance: none;
    background: linear-gradient(45deg, transparent 50%, var(--muted) 50%) calc(50% - 2px) 55% / 4px 4px no-repeat,
      linear-gradient(135deg, var(--muted) 50%, transparent 50%) calc(50% + 2px) 55% / 4px 4px no-repeat; }
  .crumb-switch:hover { background-color: var(--hover-background); }
  .crumb-switch option { color: var(--text); background: var(--surface); }
  /* A narrow panel (#159): the source goes below the breadcrumb */
  @container panel (max-width: 20rem) {
    .head { flex-wrap: wrap; gap: 0 .5rem; }
  }
  .add .controls { flex-wrap: nowrap; }
  .add .field { min-width: 0; max-width: 7rem; }
  .add .file-pick { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; justify-content: flex-start; }
  .w { width: 6rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .fields :global(.scrub) { width: 100%; }
  .axes { display: flex; align-items: center; gap: .25rem; min-width: 0; }
  .axes .fields { flex: 1; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .link-slot { flex: none; width: var(--control-height); }
  .row > .field { width: 100%; }
  .tabular { font-variant-numeric: tabular-nums; }
  .time { width: 100%; margin: 0; accent-color: var(--text); }
  .text-link.on { color: var(--text); }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
