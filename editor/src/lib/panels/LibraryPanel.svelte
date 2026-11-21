<script lang="ts">
  import { tick, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { ApiError, assetUsages, errorText, planAssetNames, type Asset, type AssetRename, type Usage } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import { codeKindOf, codeUploadProblem, pluginIdFrom } from "#lib/library-code.js";
  import { ACCEPT, library } from "#lib/library.svelte.js";
  import { libraryDrag, pressTile } from "#lib/library-drag.svelte.js";
  import { recognitionFrames } from "#lib/recognition-frames.svelte.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import { selection } from "#lib/selection.svelte.js";
  import {
    assetLabel, assetPlace, convertedNotice, formatSize, heldNotice, matchesSearch, moreUses, namesPlanLine, readLibraryView, saveLibraryView, type LibraryView,
  } from "#lib/library-place.js";
  import {
    LIBRARY_FILTERS, LIBRARY_ORIGINS, isTargetImage, matchesFilter, matchesOrigin, nodeAssetKinds, pickAccept, pickFilter, pickFit, pickFits, targetImagesOf, type LibraryFilter, type LibraryOrigin, type LibraryPick,
  } from "#lib/library-pick.js";
  import {
    KIND_LABELS, LIBRARY_GROUPINGS, LIBRARY_SORTS, SORT_LABELS, TILE_SIZE, inScope, indexUsages, isRecent, kindCounts, libraryGroups, libraryIndex, matchesSpecial, missingCredits, nextChosen,
    readLibrarySort, readTileSize, saveLibrarySort, saveTileSize, sceneCounts, scopeCounts, startScope, startsFolded, surfaceImagesOf, tileKind, tileMeta, usageJump, useWord,
    type LibraryGrouping, type LibraryScope, type LibrarySort, type LibrarySpecial, type ShownGroup,
  } from "#lib/library-scope.js";
  import { filesSize, frameFiles, isOptionalLevel, levelCount, libraryItems, librarySets, stackRange, type LibraryFrame, type LibraryStack, type StackLevel } from "#lib/library-sets.js";
  import Icon from "#lib/components/Icon.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import ToolMenu from "#lib/components/ToolMenu.svelte";
  import ContextMenu, { type MenuItem } from "#lib/components/ContextMenu.svelte";
  import AssetTile from "./AssetTile.svelte";
  import AssetDetails from "./AssetDetails.svelte";
  import CodeFiles from "./CodeFiles.svelte";
  import LibraryNodes from "./LibraryNodes.svelte";
  import { palette } from "#lib/logic/palette.js";

  /**
   * The experience's library (#330): the files uploaded in the editor and, after them, the files of the content import
   * (`files.json`, read-only – docs/server.md "Assets"); and under the kind *Nodes* the logic's node types (`LibraryNodes`, #334),
   * dragged onto the Logic canvas.
   *
   * **The panel tab.** On top the **scope** – *This scene · <label>* (the open scene's files: its surfaces' reference
   * images, its targets' printed images, the files its targets' nodes name, its entries' pictures – the default while a
   * scene is open), *All*, *Unused* (used nowhere) – with their counts; then the search and **Upload** (the button, or
   * files dropped anywhere on the panel); the **kinds** as chips counted within the scope (targets, surfaces, images,
   * video, 3D, audio – and *Code*, whose list `CodeFiles` stays under the media); the **sort** (name, recently added,
   * size, uses), the **tile size**, grid or list (both remembered per browser) and **⋯** (the origin – uploaded /
   * imported, #245 – and *Name by use…*). The files come as square **tiles** (`AssetTile`) in groups: in *All* the open
   * scene's files pinned on top, then *Unused*, then a folded group per other scene (`library-scope.ts`); a search unfolds
   * them. A click selects a file – the **details drawer** at the panel's bottom (`AssetDetails`: the preview, the facts,
   * where it is used – a click there shows that target, entry or surface –, the credits and every action: *Use for the
   * selection*, *Set as target image*, *Replace…*, *Download*, *Delete* – refused while used, then *Delete anyway*); a
   * double click uses it; hovered a tile offers *Use · Replace · ⋯* (⋯ and a right click: the context menu).
   * **Rename** (#330): the details' *Rename*, the menu's *Rename…* or F2 on the selected file open its name field – the
   * name only, the URL and every use stay. **A tile dragged onto a tree row** (`library-drag.svelte.ts`; a mouse moves,
   * a finger holds first): the row's node takes the file, a target row a picture as its printed image – the tree's
   * action through the workspace's drop; a drop that does not fit says why and changes nothing.
   *
   * **Stacks and frames** (#331, `library-sets.ts`): the levels of one picture – a model's map at 512 … 4096 px, a video's
   * subtitles by language – are one tile with the levels behind it; ▤ opens them in a row under it, each level a tile of
   * its own (replaced alone – every link stays), a missing one a slot that shows the model node, where the Inspector's
   * *textures* add it. A model's mesh and its maps, a video and its subtitles stand in a frame. Only what the draft links:
   * **the Library makes no link** (Tilman, 2026-11-19). The browser's *levels: stacked / single* shows every file alone.
   *
   * **The browser** (⤢): the same library as a large window over the stage (Esc closes): places on the left with their
   * counts (the scopes, *Recently added*, *Missing credits*, the kinds, every scene, the origin), the grid in the middle
   * grouped by scene, kind or not at all, the selected file's details on the right; several files at once (Shift / Ctrl)
   * for *Download*, *Credits…* and *Delete*.
   *
   * **The picker** (`pick`, a file field's *Library…* – #164): only the files that fit, the kind it picks first; a click
   * on a file picks it for that one field and returns, an upload that fits is picked at once; *cancel* or Esc returns
   * without one. Bytes the Library held already say so (the file takes the upload's name); a picture the image rule
   * converted says what it became.
   */
  let { experienceId, sceneId: sceneIdProp = null, pick = null, nodeType = null, targetId = null, onuse, onusetarget, onchanged, onopencode }: {
    experienceId: string;
    /** The open scene (its files are the scope *This scene*) – by default the route's */
    sceneId?: string | null;
    /** Opened as a picker for one field */
    pick?: LibraryPick | null;
    /** The selected node's type (its file kind) – null without a node */
    nodeType?: string | null;
    /** The selected target (an image may become its printed image) */
    targetId?: string | null;
    /** The selected node takes this asset */
    onuse?: (asset: Asset) => void;
    /** The selected target's printed image becomes this asset */
    onusetarget?: (asset: Asset) => Promise<void>;
    /** A replace changed the draft (uses relinked): the content should reload */
    onchanged?: () => Promise<void>;
    /** Show the Code tab (a script of the code list is in `plugins.focus`) */
    onopencode?: () => void;
  } = $props();

  const sceneId = $derived(sceneIdProp ?? page.params.scene ?? null);
  const sceneLabel = $derived((sceneId && content.scene(sceneId)?.label) || sceneId || "");
  /** "Now" for *Recently added*: the moment the Library opened */
  const now = Date.now();

  let scope = $state<LibraryScope>(untrack(() => startScope(sceneId, !!pick)));
  // svelte-ignore state_referenced_locally
  let filter = $state<LibraryFilter>(pick ? pickFilter(pick.subject) : "all");
  let origin = $state<LibraryOrigin>("all");
  let special = $state<LibrarySpecial>(null);
  let search = $state("");
  let sort = $state<LibrarySort>(readLibrarySort());
  let tileSize = $state(readTileSize());
  let view = $state<LibraryView>(readLibraryView());
  let grouping = $state<LibraryGrouping>("scene");
  let expanded = $state(false);
  /** The stacks shown as one tile (#331) – the browser can show every level alone */
  let stacked = $state(true);
  /** The stacks whose levels are open, by key */
  let openStacks = $state<string[]>([]);
  /** The frames folded to their head, by key */
  let foldedFrames = $state<string[]>([]);
  let folds = $state<Record<string, boolean>>({});

  let fileInput = $state<HTMLInputElement>();
  let replaceInput = $state<HTMLInputElement>();
  let expandButton = $state<HTMLButtonElement>();
  let browserBox = $state<HTMLElement>();
  let replacing = $state<Asset | null>(null);
  let confirming = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let dragging = $state(false);
  /** The files uploaded here since the panel opened: marked in the grid and the list */
  let fresh = $state<string[]>([]);
  /** The file the details show */
  let selectedId = $state<string | null>(null);
  /** The browser's selection (Shift / Ctrl: several) */
  let chosen = $state<string[]>([]);
  let anchor: string | null = null;
  let menu = $state<{ at: { x: number; y: number }; asset: Asset } | null>(null);

  const setView = (next: LibraryView) => {
    view = next;
    saveLibraryView(next);
  };
  const setSort = (next: LibrarySort) => {
    sort = next;
    saveLibrarySort(next);
  };
  const setTileSize = (next: number) => {
    tileSize = next;
    saveTileSize(next);
  };

  $effect(() => {
    if (library.experienceId !== experienceId) void library.load(experienceId);
  });

  const targetImages = $derived(targetImagesOf(content.scenes));
  /** What belongs together: the levels of a map, a model's parts, a video's subtitles (#331) */
  const sets = $derived(librarySets(library.assets, content.scenes));
  const toggleIn = (list: string[], key: string) => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]);
  const levelsBadge = (stack: LibraryStack) => {
    const count = levelCount(stack);
    const what = stack.kind === "subtitles" ? "languages" : "levels";
    return {
      text: count.there === count.of ? String(count.there) : `${count.there}/${count.of}`,
      gap: count.there < count.of,
      title: `${count.there} ${what}: ${stackRange(stack)}${count.there < count.of ? " – a level is missing" : ""}`,
    };
  };
  /** A missing level: the node it is added on (the Inspector's textures or levels) – the Library makes no link */
  const showNode = (stack: LibraryStack): (() => void) | null => {
    const targetId = stack.node?.targetId ?? stack.media?.targetId;
    return targetId ? jumpTo({ kind: "target", ref: targetId }) : null;
  };
  /** Where a missing level of the stack is added (#331: a medium's levels in the Inspector's levels) */
  const addedIn = (stack: LibraryStack) =>
    stack.kind === "media" ? `the Inspector's levels of the ${stack.medium} node${stack.medium === "image" ? " (Compute makes it from the largest picture)" : ""}` : "the Inspector's textures of the model node (Compute makes it from the largest map)";
  /** What a stack's levels are, for its tray and details */
  const stackWhat = (stack: LibraryStack) =>
    stack.kind === "map" ? "levels – each replaced alone, every link stays" : stack.kind === "media" ? `${stack.medium} levels – each replaced alone, every link stays` : "subtitles by language";
  const slotTitle = (stack: LibraryStack, level: StackLevel) =>
    isOptionalLevel(stack, level) ? `${level.label} – optional, a larger level` : `${level.label} is missing`;
  const stackSize = (stack: LibraryStack) => formatSize(filesSize(stack.levels.flatMap(level => (level.asset ? [level.asset] : []))));
  const surfaceImages = $derived(surfaceImagesOf(scenes.references));
  /** The draft's uses of the files by scene */
  const index = $derived(libraryIndex(content.scenes, scenes.references));
  /** The media (the shaders are in the code list); a picker's: the ones that fit */
  const media = $derived(library.assets.filter(asset => asset.kind !== "shader" && (!pick || pickFits(pick.subject, asset))));
  const searched = $derived(media.filter(asset => matchesSearch(asset, search)));
  const base = $derived(searched.filter(asset => matchesOrigin(asset, origin) && matchesSpecial(asset, special, now, index)));
  const counts = $derived(scopeCounts(base, sceneId, index));
  const scoped = $derived(base.filter(asset => inScope(asset, scope, sceneId, index)));
  const kinds = $derived(kindCounts(scoped, targetImages, surfaceImages));
  const codeCount = $derived(library.assets.filter(asset => asset.kind === "shader").length + plugins.stored.length);
  /** The logic's node types (#334): the registry's, the same list as the Logic canvas's menu */
  const nodeCount = palette().length;
  /** The kinds' chips: the ones that hold a file, the one chosen; Code apart from a picker */
  const kindChips = $derived(LIBRARY_FILTERS.filter(kind => kind === "all" || kind === filter || (kind === "code" || kind === "nodes" ? !pick : kinds[kind] > 0)));
  const shown = $derived(scoped.filter(asset => matchesFilter(asset, filter, targetImages, surfaceImages)));
  const groups = $derived(libraryGroups(shown, {
    scope, grouping: expanded ? grouping : "scene", sort, sceneId, sceneLabel, scenes: content.scenes, index, targetImages, surfaceImages,
  }));
  const isFolded = (group: ShownGroup): boolean => (search.trim() ? false : folds[group.key] ?? (!expanded && startsFolded(group, scope)));
  const toggleFold = (group: ShownGroup) => (folds = { ...folds, [group.key]: !isFolded(group) });
  /** The files in the order shown (the browser's Shift runs) */
  const order = $derived(groups.filter(group => !isFolded(group)).flatMap(group => group.assets.map(asset => asset.id)));
  const showCode = $derived(!pick && (filter === "code" || (filter === "all" && scope === "all" && !special)));

  // ── the browser's places: counted on the search alone ──
  const places = $derived({
    scopes: scopeCounts(searched, sceneId, index),
    recent: searched.filter(asset => isRecent(asset, now)).length,
    credits: searched.filter(missingCredits).length,
    kinds: kindCounts(searched, targetImages, surfaceImages),
    scenes: sceneCounts(searched, index),
    uploaded: searched.filter(asset => !asset.imported).length,
    imported: searched.filter(asset => asset.imported).length,
  });
  /** A place of the sidebar: the scope, the kind, the origin and the special filter it sets */
  const goPlace = (next: { scope?: LibraryScope; filter?: LibraryFilter; origin?: LibraryOrigin; special?: LibrarySpecial }) => {
    scope = next.scope ?? "all";
    filter = next.filter ?? (pick ? pickFilter(pick.subject) : "all");
    origin = next.origin ?? "all";
    special = next.special ?? null;
  };
  const plainPlace = $derived(!special && origin === "all");

  /** Name by use (#298): the plan shown, then applied – null while none is open */
  let namesPlan = $state<AssetRename[] | null>(null);
  let naming = $state(false);
  const proposeNames = async () => {
    naming = true;
    library.error = null;
    try {
      namesPlan = (await planAssetNames(experienceId)).plan.renames;
    } catch (e) {
      library.error = errorText(e);
    } finally {
      naming = false;
    }
  };
  const applyNames = async () => {
    naming = true;
    try {
      const { plan } = await planAssetNames(experienceId, true);
      notice = `${plan.renames.length} file${plan.renames.length === 1 ? "" : "s"} renamed by use – every URL stays`;
      namesPlan = null;
      await library.load(experienceId);
    } catch (e) {
      library.error = errorText(e);
    } finally {
      naming = false;
    }
  };

  /** Scripts uploading (they become plugin sources), by file name */
  let scriptUploads = $state<string[]>([]);
  const uploading = $derived([...library.uploading, ...scriptUploads]);
  const fits = (asset: Asset) => {
    void plugins.version;
    return !!nodeType && (nodeAssetKinds(nodeType) ?? []).includes(asset.kind);
  };
  /** Why Use (or Pick) cannot take the file – null: it can */
  const useBlocked = (asset: Asset): string | null => {
    if (pick) return pickFits(pick.subject, asset) ? null : `Does not fit ${pick.label}`;
    if (fits(asset)) return null;
    return nodeType ? `A ${nodeType} node takes no ${asset.kind}` : "Select a node first";
  };

  const choose = (asset: Asset) => {
    if (pick && pickFits(pick.subject, asset)) void pick.onpick(asset);
  };
  /** Use: a picker picks; else the selected node takes the file (the browser closes) – a file it cannot take is selected */
  const activate = (asset: Asset) => {
    if (pick) return choose(asset);
    if (!fits(asset)) return select(asset, { shift: false, toggle: false });
    expanded = false;
    onuse?.(asset);
  };
  const select = (asset: Asset, keys: { shift: boolean; toggle: boolean }) => {
    if (pick) return choose(asset);
    confirming = null;
    if (expanded) {
      const next = nextChosen(chosen, anchor, asset.id, order, keys);
      chosen = next.chosen;
      anchor = next.anchor;
      selectedId = chosen.includes(asset.id) ? asset.id : (chosen.at(-1) ?? null);
    } else {
      chosen = [asset.id];
      anchor = asset.id;
      selectedId = asset.id;
    }
  };
  const isSelected = (asset: Asset) => (expanded ? chosen.includes(asset.id) : selectedId === asset.id);
  const selected = $derived(selectedId ? (library.assets.find(asset => asset.id === selectedId) ?? null) : null);

  // ── the selected file's uses (the API's; an imported file's from the draft – the API lists none for it) ──
  let usages = $state<Usage[] | null>(null);
  let usagesRun = 0;
  const usagesKey = $derived(selected ? `${selected.id}|${selected.url}|${selected.usages}` : null);
  $effect(() => {
    void usagesKey;
    const asset = untrack(() => selected);
    const run = ++usagesRun;
    if (!asset) {
      usages = null;
      return;
    }
    const fromDraft = () => untrack(() => indexUsages(asset, index));
    if (asset.imported) {
      usages = fromDraft();
      return;
    }
    usages = null;
    assetUsages(experienceId, asset.id).then(
      answer => { if (run === usagesRun) usages = answer.usages; },
      () => { if (run === usagesRun) usages = fromDraft(); },
    );
  });
  /** Show a use: its scene opens (when it is another) and the Inspector shows the target, entry or surface */
  const jumpTo = (usage: Usage): (() => void) | null => {
    const jump = usageJump(usage, content.scenes);
    if (!jump) return null;
    return () => {
      expanded = false;
      if (page.params.scene === jump.sceneId) selection.show(jump.select);
      else {
        selection.requestOn(jump.sceneId, jump.select);
        void goto(resolve(`${experienceId}/${jump.sceneId}/`));
      }
    };
  };
  const useItems = $derived.by(() => {
    if (!usages || !selected) return null;
    const items = usages.map(usage => ({ text: useWord(usage, content.scenes), jump: jumpTo(usage) }));
    const rest = selected.usages - items.length;
    if (selected.imported && rest > 0) items.push({ text: `+${rest} more (the environment, a plugin)`, jump: null });
    return items;
  });

  /** A script file becomes a plugin source named after it (an id taken: the code list's Replace… is the way) */
  const uploadScript = async (file: File) => {
    scriptUploads = [...scriptUploads, file.name];
    try {
      const plugin = await plugins.upload(experienceId, file);
      notice = `${file.name} is the plugin ${plugin.id} – open it in the Code tab from the code list`;
      void plugins.load(experienceId);
    } catch (e) {
      library.error = e instanceof ApiError && e.code === "plugin-exists"
        ? `${file.name}: the plugin ${pluginIdFrom(file.name)} exists – Replace… it in the code list`
        : `${file.name}: ${errorText(e)}`;
    } finally {
      scriptUploads = scriptUploads.filter(name => name !== file.name);
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    notice = null;
    for (const file of Array.from(files)) {
      const problem = codeUploadProblem(file);
      if (problem) {
        library.error = problem;
        continue;
      }
      if (codeKindOf(file.name) === "script") {
        if (pick) notice = `${file.name} does not fit ${pick.label}`;
        else await uploadScript(file);
        continue;
      }
      try {
        const names = new Map(library.assets.map(a => [a.id, a.name]));
        const asset = await library.upload(experienceId, file, pick ? pickFit(pick.subject) : undefined);
        // Picking: the first upload that fits is the pick
        if (pick) {
          if (pickFits(pick.subject, asset)) return choose(asset);
          notice = `${asset.name} does not fit ${pick.label} – it stays in the Library`;
          continue;
        }
        const conversion = library.converted?.assetId === asset.id ? library.converted : null;
        notice = heldNotice(asset, names.get(asset.id)) ?? (conversion ? convertedNotice(asset, conversion) : notice);
        showUploaded(asset);
      } catch {
        // library.error says
      }
    }
  };
  /** The file just uploaded is marked, selected and in view: a scope, a kind, an origin or a search that hides it gives way */
  const showUploaded = (asset: Asset) => {
    fresh = [...fresh.filter(id => id !== asset.id), asset.id];
    if (asset.kind === "shader") return;
    if (!inScope(asset, scope, sceneId, index)) scope = asset.usages === 0 ? "unused" : "all";
    if (!matchesFilter(asset, filter, targetImages, surfaceImages)) filter = "all";
    if (!matchesOrigin(asset, origin)) origin = "all";
    if (!matchesSpecial(asset, special, now, index)) special = null;
    if (!matchesSearch(asset, search)) search = "";
    selectedId = asset.id;
    chosen = [asset.id];
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    dragging = false;
    if (event.dataTransfer?.files.length) void uploadFiles(event.dataTransfer.files);
  };
  const startReplace = (asset: Asset) => {
    replacing = asset;
    replaceInput?.click();
  };
  const doReplace = async (file: File) => {
    const asset = replacing;
    replacing = null;
    if (!asset) return;
    try {
      const next = await library.replace(experienceId, asset.id, file);
      const conversion = library.converted?.assetId === next.id ? library.converted : null;
      notice = `${next.name} is version ${next.version}; ${next.usages} use${next.usages === 1 ? "" : "s"} relinked${conversion ? ` · ${convertedNotice(next, conversion)}` : ""}`;
      await onchanged?.();
      // A new version of a printed image dropped its targets' recognition frames (#306): made again by themselves
      if (next.kind === "image" && content.experienceId === experienceId) {
        for (const target of content.scenes.flatMap(scene => scene.targets)) {
          if (target.imageSrc === next.url) recognitionFrames.autoFor(experienceId, target.id, next.url);
        }
      }
    } catch {
      // library.error says
    }
  };
  // ── rename (#330): the details' name field – *Rename*, the menu's *Rename…* or F2 on the selected file ──
  let renaming = $state(false);
  const startRename = (asset: Asset) => {
    if (pick) return;
    if (selectedId !== asset.id) select(asset, { shift: false, toggle: false });
    renaming = true;
  };
  /** Saves the name: null when saved, else why not (the field stays open) */
  const rename = async (asset: Asset, name: string): Promise<string | null> => {
    try {
      const saved = await library.rename(experienceId, asset.id, name);
      notice = `renamed to ${saved} – the URL and every use stay`;
      return null;
    } catch (e) {
      return errorText(e);
    }
  };
  /** F2 on the selected file (not in a field): its name field opens */
  const onRenameKey = (event: KeyboardEvent) => {
    if (event.key !== "F2" || pick || !selected || event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    renaming = true;
  };

  const forget = (id: string) => {
    if (selectedId === id) selectedId = null;
    chosen = chosen.filter(c => c !== id);
  };
  const remove = async (asset: Asset, force: boolean) => {
    try {
      await library.remove(experienceId, asset.id, force);
      confirming = null;
      forget(asset.id);
      notice = `${asset.name} deleted`;
    } catch (e) {
      if (e instanceof ApiError && e.code === "asset-in-use") {
        confirming = asset.id;
        selectedId = asset.id;
      } else library.error = errorText(e);
    }
  };
  /** The file to the person's downloads (its bytes – the Library's media allow any origin); a refused fetch opens it instead */
  const download = async (asset: Asset) => {
    try {
      const response = await fetch(asset.url);
      if (!response.ok) throw new Error(String(response.status));
      const href = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = href;
      link.download = asset.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      window.open(asset.url, "_blank", "noopener");
    }
  };

  // ── the browser's several files ──
  const chosenAssets = $derived(chosen.map(id => library.assets.find(asset => asset.id === id)).filter((asset): asset is Asset => !!asset));
  let bulkCredits = $state<string | null>(null);
  let bulkInUse = $state<string[]>([]);
  let bulkBusy = $state(false);
  const bulkDownload = async () => {
    for (const asset of chosenAssets) await download(asset);
  };
  const bulkDelete = async (force: boolean) => {
    const list = (force ? chosenAssets.filter(asset => bulkInUse.includes(asset.id)) : chosenAssets).filter(asset => !asset.imported);
    const skipped = force ? 0 : chosenAssets.length - list.length;
    const inUse: string[] = [];
    let deleted = 0;
    bulkBusy = true;
    for (const asset of list) {
      try {
        await library.remove(experienceId, asset.id, force);
        forget(asset.id);
        deleted++;
      } catch (e) {
        if (e instanceof ApiError && e.code === "asset-in-use") inUse.push(asset.id);
        else library.error = `${asset.name}: ${errorText(e)}`;
      }
    }
    bulkBusy = false;
    bulkInUse = inUse;
    notice = `${deleted} file${deleted === 1 ? "" : "s"} deleted${inUse.length ? ` · ${inUse.length} in use` : ""}${skipped ? ` · ${skipped} imported (read-only)` : ""}`;
  };
  const bulkSetCredits = async () => {
    if (bulkCredits === null) return;
    bulkBusy = true;
    try {
      await library.setCreditsMany(experienceId, [...new Set(chosenAssets.map(asset => asset.url))], bulkCredits.trim());
      notice = `credits set on ${chosenAssets.length} file${chosenAssets.length === 1 ? "" : "s"}`;
      bulkCredits = null;
    } catch {
      // library.error says
    } finally {
      bulkBusy = false;
    }
  };
  const clearChosen = () => {
    chosen = selectedId ? [selectedId] : [];
    bulkInUse = [];
    bulkCredits = null;
  };

  const openBrowser = async () => {
    expanded = true;
    folds = {};
    chosen = selectedId ? [selectedId] : [];
    await tick();
    browserBox?.focus();
  };
  const closeBrowser = async () => {
    expanded = false;
    folds = {};
    special = null;
    bulkInUse = [];
    bulkCredits = null;
    await tick();
    expandButton?.focus();
  };

  const menuItems = (asset: Asset): MenuItem[] => [
    { label: pick ? "Pick" : "Use for the selection", disabled: useBlocked(asset), select: () => activate(asset) },
    ...(!pick && asset.kind === "image" && targetId && onusetarget ? [{ label: "Set as target image", select: () => void onusetarget(asset) }] : []),
    ...(!pick ? [{ label: "Details", select: () => select(asset, { shift: false, toggle: false }) }] : []),
    ...(!pick ? [{ label: "Rename…", keys: "F2", select: () => startRename(asset) }] : []),
    ...(!pick && !asset.imported ? [{ label: "Replace…", select: () => startReplace(asset) }] : []),
    { label: "Download", icon: "download" as const, select: () => void download(asset) },
    ...(!pick && !asset.imported ? [{ label: "Delete", icon: "trash" as const, danger: true, select: () => void remove(asset, false) }] : []),
  ];

  /** Moves the node to the page's body (the browser covers the whole window, whatever panel holds the Library) */
  const portal = (node: HTMLElement) => {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (expanded) {
      event.preventDefault();
      void closeBrowser();
    } else if (pick) pick.oncancel();
  };
</script>

{#snippet detailActions(asset: Asset)}
  {#if pick}
    <button type="button" class="pill primary" disabled={!!useBlocked(asset)} onclick={() => choose(asset)}>{pick.current === asset.url ? "Chosen" : "Pick"}</button>
  {:else}
    <button type="button" class="pill primary" disabled={!fits(asset)} title={useBlocked(asset) ?? `The selected ${nodeType} node takes this file`} onclick={() => activate(asset)}>Use for the selection</button>
    {#if asset.kind === "image" && targetId && onusetarget}
      <button type="button" class="pill" title="Becomes the printed image of the target {targetId}" onclick={() => void onusetarget(asset)}>Set as target image</button>
    {/if}
    {#if !asset.imported}<button type="button" class="pill" title="A new version – every use relinked" onclick={() => startReplace(asset)}>Replace…</button>{/if}
    <button type="button" class="pill" onclick={() => void download(asset)}>Download</button>
    {#if asset.imported}
      <span class="small muted" title="From the content import – replaced by the next import, not here">imported · read-only</span>
    {:else if confirming === asset.id}
      <span class="small danger">in use –</span>
      <button type="button" class="text-link danger" onclick={() => void remove(asset, true)}>Delete anyway</button>
      <button type="button" class="text-link" onclick={() => (confirming = null)}>keep</button>
    {:else}
      <button type="button" class="text-link" onclick={() => void remove(asset, false)}>Delete</button>
    {/if}
  {/if}
{/snippet}

{#snippet details(asset: Asset, wide: boolean, onclose: (() => void) | undefined)}
  {@const stack = sets.stackOf.get(asset.id)}
  <AssetDetails {asset} label={assetLabel(asset)} kind={isTargetImage(asset, targetImages) ? "target image" : tileKind(asset, targetImages, surfaceImages)}
    uses={useItems} {wide} {onclose} bind:renaming onrename={pick ? undefined : name => rename(asset, name)}>
    {#snippet actions()}{@render detailActions(asset)}{/snippet}
    {#snippet extra()}{#if stack}{@render levelsBlock(stack, asset)}{/if}{/snippet}
  </AssetDetails>
{/snippet}

{#snippet tile(asset: Asset, as: { label?: string; meta?: string; stack?: LibraryStack; level?: string } = {})}
  <AssetTile {asset} label={as.label ?? assetLabel(asset)} kind={tileKind(asset, targetImages, surfaceImages)} target={isTargetImage(asset, targetImages)}
    levels={as.stack ? levelsBadge(as.stack) : null} level={as.level ?? null} open={!!as.stack && openStacks.includes(as.stack.key)}
    onlevels={as.stack ? () => (openStacks = toggleIn(openStacks, as.stack!.key)) : undefined}
    meta={as.meta ?? tileMeta(asset, fresh.includes(asset.id))} selected={isSelected(asset)} marked={(!!pick && pick.current === asset.url) || fresh.includes(asset.id)}
    useLabel={pick ? (pick.current === asset.url ? "Chosen" : "Pick") : "Use"} useBlocked={useBlocked(asset)} replaceable={!pick && !asset.imported}
    onselect={keys => select(asset, keys)} onactivate={() => activate(asset)} onreplace={() => startReplace(asset)}
    onmore={at => (menu = { at, asset })} onpress={pick || expanded ? undefined : e => pressTile(e, asset, as.label ?? assetLabel(asset))} />
{/snippet}

{#snippet stackTile(stack: LibraryStack)}
  {@render tile(stack.face, { label: stack.label, stack, meta: `${stackRange(stack)} · ${stackSize(stack)}` })}
  {#if openStacks.includes(stack.key)}
    <li class="tray" aria-label="The levels of {stack.label}">
      <div class="tray-head small"><b>{stack.label}</b> <span class="muted">· {stackWhat(stack)}</span>
        <span class="grow"></span><button type="button" class="text-link" onclick={() => (openStacks = toggleIn(openStacks, stack.key))}>close</button></div>
      <ul class="tiles" style:--tile="{Math.max(TILE_SIZE.min, tileSize - 1)}rem">
        {#each stack.levels as level (level.label)}
          {#if level.asset}{@render tile(level.asset, { level: level.label })}
          {:else}
            {@const jump = showNode(stack)}
            <li class="slot" class:optional={isOptionalLevel(stack, level)}>
              <button type="button" class="slot-pic" disabled={!jump} title="{slotTitle(stack, level)} – added in {addedIn(stack)}" onclick={() => jump?.()}>
                <span>{level.label}</span><span class="small">{isOptionalLevel(stack, level) ? "optional" : "missing"}</span></button>
              <div class="small muted">show the node</div>
            </li>
          {/if}
        {/each}
      </ul>
    </li>
  {/if}
{/snippet}

{#snippet frameTile(frame: LibraryFrame)}
  {@const files = frameFiles(frame)}
  {@const folded = foldedFrames.includes(frame.key)}
  <li class="frame" aria-label="{frame.kind} {frame.label}">
    <button type="button" class="frame-head small" aria-expanded={!folded} onclick={() => (foldedFrames = toggleIn(foldedFrames, frame.key))}>
      <Icon name={folded ? "next" : "down"} size=".9em" /><b>{frame.label}</b>
      <span class="muted">{frame.kind} · {frame.stacks.length + (frame.main ? 1 : 0)} parts · {files.length} files · {formatSize(filesSize(files))}</span></button>
    {#if !folded}
      <ul class="tiles">
        {#if frame.main}{@render tile(frame.main)}{/if}
        {#each frame.stacks as stack (stack.key)}{@render stackTile(stack)}{/each}
      </ul>
    {/if}
  </li>
{/snippet}

{#snippet levelsBlock(stack: LibraryStack, asset: Asset)}
  {@const frame = sets.frameOf.get(asset.id)}
  <div class="levels-block small">
    <div class="muted">{stack.kind === "map" ? `${levelCount(stack).there} levels of the map` : stack.kind === "media" ? `${levelCount(stack).there} levels of the ${stack.medium}` : "subtitles"} <b>{stack.label}</b>{#if frame} · {frame.kind} {frame.label}{/if}</div>
    <table>
      <tbody>
        {#each [...stack.levels].reverse() as level (level.label)}
          <tr class:on={level.asset?.id === asset.id} class:miss={!level.asset}>
            <td>{level.label}</td>
            {#if level.asset}
              {@const file = level.asset}
              <!-- the pixels only where they are not the level's size -->
              <td class="muted">{#if stack.kind === "map" && file.width && file.height && (file.width !== file.height || String(file.width) !== level.label)}<span class="danger" title="A map at this level is {level.label} × {level.label} px">{file.width}×{file.height}</span>{/if}</td>
              <td class="muted num">{formatSize(file.size)}</td>
              <td class="acts">
                <button type="button" class="icon-button" aria-label="Show {level.label}" title="Show this level" onclick={() => select(file, { shift: false, toggle: false })}><Icon name="eye" /></button>
                {#if !file.imported && !pick}<button type="button" class="icon-button" aria-label="Replace {level.label}" title="Replace this level – a new version, every link stays" onclick={() => startReplace(file)}><Icon name="replace" /></button>{/if}
                <button type="button" class="icon-button" aria-label="Download {level.label}" title="Download" onclick={() => void download(file)}><Icon name="download" /></button>
              </td>
            {:else}
              {@const jump = showNode(stack)}
              <td class="muted" colspan="2">{isOptionalLevel(stack, level) ? "optional" : "missing"}</td>
              <td class="acts">{#if jump}<button type="button" class="text-link" title="The node – {stack.kind === "media" ? "its levels" : "its textures"} in the Inspector add a level" onclick={jump}>node</button>{/if}</td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

{#snippet list(assets: Asset[])}
  <table class="list">
    <thead><tr><th>name</th><th>place</th><th>kind</th><th class="num">size</th><th class="num">uses</th></tr></thead>
    <tbody>
      {#each assets as asset (asset.id)}
        {@const place = assetPlace(asset)}
        <tr class:on={isSelected(asset) || (!!pick && pick.current === asset.url)}
          onclick={e => select(asset, { shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey })} ondblclick={() => activate(asset)}
          oncontextmenu={e => { e.preventDefault(); menu = { at: { x: e.clientX, y: e.clientY }, asset }; }}>
          <td class="name" title={asset.url}><button type="button" class="open" onclick={e => { e.stopPropagation(); select(asset, { shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey }); }}>{assetLabel(asset)}</button>{#if moreUses(asset)} <span class="muted">{moreUses(asset)}</span>{/if}{#if asset.version > 1} <span class="muted">v{asset.version}</span>{/if}{#if fresh.includes(asset.id)} <span class="muted">· just uploaded</span>{/if}</td>
          <td class="name place" title={place.place ?? ""}>{place.place ?? "upload"}</td>
          <td class="muted kind">{tileKind(asset, targetImages, surfaceImages)}</td>
          <td class="num muted size">{formatSize(asset.size)}</td>
          <td class="num muted uses">{asset.usages}<span class="unit"> use{asset.usages === 1 ? "" : "s"}</span></td>
        </tr>
      {/each}
    </tbody>
  </table>
{/snippet}

{#snippet mediaGroups()}
  {#if filter === "code" || filter === "nodes"}
    <!-- the code list alone -->
  {:else if library.loading && !library.assets.length}
    <p class="muted small">Loading…</p>
  {:else if !shown.length}
    <p class="muted small empty">{!media.length ? (pick ? "Nothing that fits yet." : "No media yet.") : scope === "scene" && !search && filter === "all" ? "This scene uses no file yet." : "Nothing matches."}</p>
  {:else}
    {#each groups as group (group.key)}
      {@const folded = isFolded(group)}
      <div class="group" class:pinned={group.pinned}>
        <button type="button" class="group-head" aria-expanded={!folded} onclick={() => toggleFold(group)}>
          <Icon name={folded ? "next" : "down"} size=".9em" />
          {#if group.pinned}<span class="tag">open scene</span>{/if}
          <span class="group-label">{group.label}</span> <span class="muted">{group.assets.length}</span>
        </button>
        {#if !folded}
          {#if view === "list"}
            {@render list(group.assets)}
          {:else}
            <ul class="tiles" role="listbox" aria-label={group.label} aria-multiselectable={expanded} style:--tile="{tileSize}rem">
              {#each libraryItems(group.assets, sets, stacked) as item (item.key)}
                {#if item.type === "file"}{@render tile(item.asset)}
                {:else if item.type === "stack"}{@render stackTile(item.stack)}
                {:else}{@render frameTile(item.frame)}{/if}
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
  {#if !expanded && scope === "scene" && filter !== "code" && filter !== "nodes"}
    <p class="more-scopes small">
      <button type="button" class="text-link" onclick={() => (scope = "unused")}>Unused · {counts.unused}</button>
      <button type="button" class="text-link" onclick={() => (scope = "all")}>All files · {counts.all}</button>
    </p>
  {/if}
  {#if showCode}
    <CodeFiles {experienceId} {search} all={filter === "all"} {onopencode} />
  {/if}
  {#if filter === "nodes" && !pick}
    <LibraryNodes {search} />
  {/if}
{/snippet}

{#snippet notices()}
  {#if namesPlan}
    <div class="names small" aria-live="polite">
      <span>{namesPlanLine(namesPlan, 0)}{#if namesPlan.length} – the name only, every URL stays{/if}</span>
      {#if namesPlan.length}
        <ul>{#each namesPlan.slice(0, 12) as rename (rename.url)}<li><span class="muted">{rename.from}</span> → {rename.to}{#if rename.more} <span class="muted">+{rename.more} more</span>{/if}</li>{/each}
          {#if namesPlan.length > 12}<li class="muted">… and {namesPlan.length - 12} more</li>{/if}</ul>
        <button type="button" class="pill primary" disabled={naming} onclick={() => void applyNames()}>Rename {namesPlan.length}</button>
      {/if}
      <button type="button" class="text-link" onclick={() => (namesPlan = null)}>{namesPlan.length ? "cancel" : "close"}</button>
    </div>
  {/if}
  {#if dragging}<p class="drop small" aria-live="polite">drop to upload – media, shaders, scripts</p>{/if}
  {#if uploading.length}<p class="small muted">uploading {uploading.join(", ")}…</p>{/if}
  {#if library.error}<p class="small danger">{library.error}</p>{/if}
  {#if notice}<p class="small muted">{notice}</p>{/if}
  {#if libraryDrag.refused && !pick}<p class="small danger" aria-live="polite">{libraryDrag.refused} – nothing changed</p>{/if}
{/snippet}

{#snippet nameByUse()}
  <button type="button" class="pill" disabled={naming} data-help-name="Name by use"
    data-help="Names every used file by where it is used first, in the scenes' order: an entry's printed image p118-1_target.webp, its picture p118-1_image.webp, a shared entity's file castle_model.glb. Shows the plan first; the name only changes – every URL and use stays. Unused files keep their names."
    onclick={() => void proposeNames()}>Name by use…</button>
{/snippet}

{#snippet viewTools()}
  <select class="field sort" aria-label="Sort" title="Sort" value={sort} onchange={e => setSort((e.currentTarget as HTMLSelectElement).value as LibrarySort)}>
    {#each LIBRARY_SORTS as option (option)}<option value={option}>{SORT_LABELS[option]}</option>{/each}
  </select>
  <input class="tile-size" type="range" min={TILE_SIZE.min} max={TILE_SIZE.max} step={TILE_SIZE.step} value={tileSize} aria-label="Tile size" title="Tile size"
    disabled={view === "list"} oninput={e => setTileSize(Number((e.currentTarget as HTMLInputElement).value))} />
  {#if expanded}
    <button type="button" class="pill framed" class:on={!stacked} aria-pressed={!stacked} disabled={view === "list"}
      title={stacked ? "Levels stacked: one tile per map, its levels behind it – show every file alone" : "Every level alone – stack them again"}
      onclick={() => (stacked = !stacked)}>levels: {stacked ? "stacked" : "single"}</button>
  {/if}
  <span class="views" role="group" aria-label="View">
    <button type="button" class="icon-button" class:on={view === "cards"} aria-pressed={view === "cards"} title="Tiles" aria-label="Tiles" onclick={() => setView("cards")}><Icon name="grid" /></button>
    <button type="button" class="icon-button" class:on={view === "list"} aria-pressed={view === "list"} title="List" aria-label="List" onclick={() => setView("list")}><Icon name="list" /></button>
  </span>
{/snippet}

{#snippet upload()}
  <button type="button" class="pill framed" data-help-name="Upload" data-help="Upload a model (glb), a video, an image or a sound, a shader (glsl, frag, vert, wgsl) or a script (ts, js – it becomes a plugin source named after the file) – or drop files on the library. Code files are at most 256 KB. While picking, an upload that fits is the pick." onclick={() => fileInput?.click()}><Icon name="plus" /> Upload</button>
{/snippet}

{#snippet contextMenu()}
  {#if menu}
    <ContextMenu at={menu.at} label="File" head={assetLabel(menu.asset)} items={menuItems(menu.asset)} onclose={() => (menu = null)} />
  {/if}
{/snippet}

<svelte:window onkeydown={onKey} />

<input bind:this={fileInput} type="file" accept={pick ? pickAccept(pick.subject) : ACCEPT} multiple={!pick} hidden onchange={e => { const f = (e.currentTarget as HTMLInputElement).files; if (f?.length) void uploadFiles(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
<input bind:this={replaceInput} type="file" accept={ACCEPT} hidden onchange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void doReplace(f); (e.currentTarget as HTMLInputElement).value = ""; }} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="library" class:dragging={dragging && !expanded} ondragover={e => { e.preventDefault(); dragging = true; }} ondragleave={() => (dragging = false)} ondrop={onDrop} onkeydown={onRenameKey}>
  {#if pick}
    <div class="section"><span class="section-label">library · {pick.label}</span>
      <button type="button" class="text-link" title="Back without a file (Esc)" onclick={pick.oncancel}>cancel</button></div>
  {/if}
  <div class="line">
    <div class="scope" role="group" aria-label="Scope">
      <button type="button" class="pill framed" class:on={scope === "scene"} aria-pressed={scope === "scene"} disabled={!sceneId}
        title="The open scene's files: its surfaces' reference images, its targets' printed images, the files its targets' nodes use, its entries' pictures"
        onclick={() => (scope = "scene")}><span class="scope-label">This scene{#if sceneLabel} · {sceneLabel}{/if}</span> <span class="n">{counts.scene}</span></button>
      <button type="button" class="pill framed" class:on={scope === "all"} aria-pressed={scope === "all"} title="Every file – the open scene's on top" onclick={() => (scope = "all")}>All <span class="n">{counts.all}</span></button>
      <button type="button" class="pill framed" class:on={scope === "unused"} aria-pressed={scope === "unused"} title="Used nowhere – no scene, entry, environment or plugin" onclick={() => (scope = "unused")}>Unused <span class="n">{counts.unused}</span></button>
    </div>
    <button bind:this={expandButton} type="button" class="icon-button" aria-label="Open the Library as a browser" title="Open as a browser – the whole library over the stage (Esc closes)" aria-expanded={expanded} onclick={() => void openBrowser()}><Icon name="maximize" /></button>
  </div>
  <div class="line">
    <input class="field grow" type="search" placeholder="Search name, entry, scene…" bind:value={search} aria-label="Search the library" title="Search the library (Ctrl+L)" data-library-search="panel" />
    {@render upload()}
  </div>
  <div class="chips" role="group" aria-label="Kinds">
    {#each kindChips as kind (kind)}
      <button type="button" class="pill framed chip" class:on={filter === kind} aria-pressed={filter === kind} onclick={() => (filter = kind)}>
        {KIND_LABELS[kind]}{#if kind !== "all"} <span class="n">{kind === "code" ? codeCount : kind === "nodes" ? nodeCount : kinds[kind]}</span>{/if}
      </button>
    {/each}
  </div>
  <div class="line tools">
    {@render viewTools()}
    <span class="grow"></span>
    <ToolMenu label="More" title={origin === "all" ? "Origin, Name by use…" : `From: ${origin} – Name by use…`} buttonLabel="More" icon="more" marked={origin !== "all"}>
      <div class="row"><span class="label">from</span>
        <span class="controls"><Segmented options={LIBRARY_ORIGINS} value={origin} label="From"
          titles={{ uploaded: "Files uploaded in the editor – replaced and deleted here", imported: "Files of the content import (files.json) – read-only, replaced by the next import" }}
          onchange={o => (origin = o)} /></span></div>
      {#if !pick}<div class="row rule"><span class="label">names</span><span class="controls">{@render nameByUse()}</span></div>{/if}
    </ToolMenu>
  </div>
  {@render notices()}

  {#if expanded}
    <p class="muted small">The Library is open as a browser.</p>
  {:else}
    <div class="media">{@render mediaGroups()}</div>
    {#if selected && !pick}
      <div class="drawer">{@render details(selected, true, () => (selectedId = null))}</div>
    {/if}
    {@render contextMenu()}
  {/if}
</div>

{#if expanded}
  <div class="browser-shade" use:portal>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="browser" class:dragging bind:this={browserBox} role="dialog" aria-modal="true" aria-label="Library" tabindex="-1"
      ondragover={e => { e.preventDefault(); dragging = true; }} ondragleave={e => { if (e.currentTarget === e.target) dragging = false; }} ondrop={onDrop} onkeydown={onRenameKey}>
      <header class="b-top">
        <span class="b-title">Library{#if pick} · {pick.label}{/if}</span>
        <input class="field b-search" type="search" placeholder="Search name, entry, scene…" bind:value={search} aria-label="Search the library" data-library-search="browser" />
        <span class="grow"></span>
        {@render viewTools()}
        {#if !pick}
          <ToolMenu label="More" title="Name by use…" buttonLabel="More" icon="more">
            <div class="row"><span class="label">names</span><span class="controls">{@render nameByUse()}</span></div>
          </ToolMenu>
        {/if}
        {@render upload()}
        <button type="button" class="icon-button" aria-label="Close the browser" title="Close (Esc)" onclick={() => void closeBrowser()}><Icon name="close" /></button>
      </header>
      <nav class="side" aria-label="Places">
        <div class="side-head">Library</div>
        <button type="button" class="place" class:on={plainPlace && scope === "scene" && filter === "all"} disabled={!sceneId} onclick={() => goPlace({ scope: "scene" })}>This scene{#if sceneLabel} · {sceneLabel}{/if} <span class="n">{places.scopes.scene}</span></button>
        <button type="button" class="place" class:on={plainPlace && scope === "all" && filter === "all"} onclick={() => goPlace({ scope: "all", filter: "all" })}>All files <span class="n">{places.scopes.all}</span></button>
        <button type="button" class="place" class:on={special?.by === "recent"} title="Added in the last 7 days" onclick={() => goPlace({ special: { by: "recent" } })}>Recently added <span class="n">{places.recent}</span></button>
        <button type="button" class="place" class:on={plainPlace && scope === "unused"} onclick={() => goPlace({ scope: "unused", filter: "all" })}>Unused <span class="n">{places.scopes.unused}</span></button>
        <button type="button" class="place" class:on={special?.by === "credits"} title="Media without a credits line" onclick={() => goPlace({ special: { by: "credits" } })}>Missing credits <span class="n">{places.credits}</span></button>
        <div class="side-head">Kinds</div>
        {#each LIBRARY_FILTERS.filter(kind => kind !== "all" && (kind === "code" || kind === "nodes" ? !pick : places.kinds[kind] > 0)) as kind (kind)}
          <button type="button" class="place" class:on={plainPlace && scope === "all" && filter === kind} onclick={() => goPlace({ scope: "all", filter: kind })}>{KIND_LABELS[kind]} <span class="n">{kind === "code" ? codeCount : kind === "nodes" ? nodeCount : places.kinds[kind]}</span></button>
        {/each}
        <div class="side-head">Scenes</div>
        {#each content.scenes.filter(scene => places.scenes.has(scene.id)) as scene (scene.id)}
          <button type="button" class="place" class:on={special?.by === "scene" && special.scene === scene.id} onclick={() => goPlace({ special: { by: "scene", scene: scene.id } })}>{scene.label || scene.id}{#if scene.id === sceneId} <span class="muted">· open</span>{/if} <span class="n">{places.scenes.get(scene.id)}</span></button>
        {/each}
        <div class="side-head">From</div>
        <button type="button" class="place" class:on={origin === "uploaded" && !special && scope === "all"} onclick={() => goPlace({ origin: "uploaded" })}>Uploaded <span class="n">{places.uploaded}</span></button>
        <button type="button" class="place" class:on={origin === "imported" && !special && scope === "all"} onclick={() => goPlace({ origin: "imported" })}>Imported <span class="n">{places.imported}</span></button>
      </nav>
      <div class="center">
        <div class="b-bar">
          <span class="small muted crumb">{shown.length} file{shown.length === 1 ? "" : "s"}{#if chosen.length > 1} · {chosen.length} selected{/if}</span>
          <span class="grow"></span>
          <span class="small muted">group</span>
          <Segmented options={LIBRARY_GROUPINGS} value={grouping} label="Group by" titles={{ scene: "By scene – the open scene's files pinned on top", kind: "By kind", none: "One list" }} onchange={g => (grouping = g)} />
        </div>
        <div class="b-notices">{@render notices()}</div>
        <div class="b-body">{@render mediaGroups()}</div>
        {#if chosen.length > 1 && !pick}
          <div class="multibar" role="toolbar" aria-label="The selected files">
            <span>{chosen.length} selected</span>
            {#if bulkCredits !== null}
              <input class="field" placeholder="Credits line for all of them" bind:value={bulkCredits} aria-label="Credits for the selected files"
                onkeydown={e => { if (e.key === "Enter") void bulkSetCredits(); else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); bulkCredits = null; } }} />
              <button type="button" class="pill primary" disabled={bulkBusy} onclick={() => void bulkSetCredits()}>Set</button>
            {:else if bulkInUse.length}
              <span class="danger">{bulkInUse.length} in use –</span>
              <button type="button" class="text-link danger" disabled={bulkBusy} onclick={() => void bulkDelete(true)}>Delete anyway</button>
              <button type="button" class="text-link" onclick={() => (bulkInUse = [])}>keep</button>
            {:else}
              <button type="button" class="pill" onclick={() => void bulkDownload()}><Icon name="download" /> Download</button>
              <button type="button" class="pill" onclick={() => (bulkCredits = "")}>Credits…</button>
              <button type="button" class="pill" disabled={bulkBusy || chosenAssets.every(asset => asset.imported)} title="Imported files are read-only" onclick={() => void bulkDelete(false)}>Delete</button>
            {/if}
            <button type="button" class="icon-button" aria-label="Clear the selection" title="Clear the selection" onclick={clearChosen}><Icon name="close" /></button>
          </div>
        {/if}
      </div>
      <aside class="detail" aria-label="The selected file">
        {#if selected && !pick}
          {@render details(selected, false, undefined)}
        {:else}
          <p class="small muted">{pick ? `A click picks the file for ${pick.label}.` : "Select a file – Shift or Ctrl for several."}</p>
        {/if}
      </aside>
      {@render contextMenu()}
    </div>
  </div>
{/if}

<style>
  .library { position: relative; display: flex; flex-direction: column; gap: .25rem; min-height: 100%; container: library / inline-size; }
  .library.dragging { outline: 1px dashed var(--text); outline-offset: -2px; }
  /* No pointer on the drop hint: a hint under the cursor would end the drag */
  .drop { position: absolute; inset: .25rem; z-index: 3; margin: 0; display: flex; align-items: center; justify-content: center; text-align: center;
    pointer-events: none; background: var(--surface); opacity: .92; border-radius: var(--control-radius); }
  .line { display: flex; align-items: center; gap: .25rem; min-width: 0; flex-shrink: 0; }
  .grow { flex: 1; min-width: 0; }
  .line .field.grow { min-width: 6rem; }
  .scope { flex: 1; min-width: 0; display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr); gap: .125rem; }
  .scope .pill { justify-content: center; min-width: 0; padding: 0 .375rem; }
  .scope-label { overflow: hidden; text-overflow: ellipsis; }
  .n { color: var(--muted); font-variant-numeric: tabular-nums; font-size: var(--text-small); }
  .on .n { color: inherit; opacity: .7; }
  .chips { display: flex; flex-wrap: wrap; gap: .125rem; flex-shrink: 0; }
  .chip { padding: 0 .5rem; }
  .tools { flex-wrap: wrap; }
  .sort { width: auto; max-width: 9rem; }
  .tile-size { width: 5rem; accent-color: var(--text); }
  .views { display: inline-flex; gap: .125rem; }
  .names { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .5rem; padding: .375rem; border: 1px solid var(--line); border-radius: var(--control-radius); }
  .names > span { flex-basis: 100%; }
  .names ul { flex-basis: 100%; margin: 0; padding-left: 1rem; }
  .names li { overflow-wrap: anywhere; }
  .media { flex: 1 0 auto; }
  .empty { margin: .5rem 0; }
  .group { margin-top: .5rem; }
  .group.pinned { padding: 0 .375rem .375rem; border: 1px solid var(--line); background: var(--surface-head); }
  .group-head { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: .375rem; width: 100%; min-height: var(--control-height); border-bottom: 1px solid var(--line); cursor: pointer; font-size: var(--text-small); }
  .group-head:focus-visible { outline: 1px solid var(--text); }
  .group.pinned .group-head { border-bottom: none; }
  .group-label { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { padding: 0 .3rem; background: var(--text); color: var(--surface); font-size: .625rem; text-transform: uppercase; letter-spacing: .06em; }
  /* #331: a frame around a thing's parts, the open levels of a stack, a missing level */
  .frame, .tray { grid-column: 1 / -1; list-style: none; min-width: 0; }
  .frame { border: 1px solid var(--line); border-left: 3px solid var(--text); padding: 0 .375rem .5rem; }
  .frame-head { all: unset; box-sizing: border-box; display: flex; align-items: baseline; gap: .375rem; width: 100%; min-height: var(--control-height); cursor: pointer; }
  .frame-head:focus-visible { outline: 1px solid var(--text); }
  .frame-head .muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tray { border: 1px solid var(--line); border-top: 2px solid var(--text); padding: .25rem .375rem .5rem; background: var(--surface-head); }
  .tray-head { display: flex; align-items: baseline; gap: .25rem; min-width: 0; }
  .tray-head .muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .slot { display: flex; flex-direction: column; gap: .125rem; min-width: 0; }
  .slot-pic { aspect-ratio: 1; border: 1px dashed var(--muted); background: none; color: var(--muted); font: inherit; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .125rem; cursor: pointer; }
  .slot-pic:disabled { cursor: default; }
  .slot.optional .slot-pic { border-style: dotted; opacity: .7; }
  @media (hover: hover) { .slot-pic:not(:disabled):hover { color: var(--text); border-color: var(--text); } }
  .levels-block table { width: 100%; border-collapse: collapse; margin-top: .25rem; }
  .levels-block { min-width: 0; }
  .levels-block td { padding: .125rem .25rem; border-top: 1px solid var(--line); white-space: nowrap; }
  .levels-block td.acts .icon-button { width: 1.5rem; height: 1.5rem; }
  .levels-block td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .levels-block td.acts { text-align: right; }
  .levels-block tr.on td:first-child { font-weight: 600; }
  .levels-block tr.miss td:first-child { color: var(--muted); }
  .tiles { list-style: none; margin: .375rem 0 0; padding: 0; display: grid; gap: .5rem; grid-template-columns: repeat(auto-fill, minmax(min(var(--tile, 7rem), 100%), 1fr)); }
  .more-scopes { display: flex; gap: .75rem; margin: .5rem 0 0; }
  .drawer { position: sticky; bottom: 0; z-index: 2; margin-top: .5rem; padding: .5rem 0; max-height: 55vh; overflow: auto; border-top: 1px solid var(--muted); background: var(--surface); }

  .list { width: 100%; margin-top: .375rem; border-collapse: collapse; table-layout: fixed; }
  .list th { text-align: left; font-weight: normal; color: var(--muted); font-size: var(--text-small); }
  .list th, .list td { padding: .2rem .25rem; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .list th:nth-child(1), .list th:nth-child(2) { width: 30%; }
  .list th:nth-child(3) { width: 14%; }
  .list th:nth-child(4) { width: 16%; }
  .list th:nth-child(5) { width: 10%; }
  .list tbody tr { cursor: pointer; }
  @media (hover: hover) { .list tbody tr:hover { background: var(--hover-background); } }
  .list tr.on { background: var(--selected-background); }
  .list .num { text-align: right; white-space: nowrap; }
  .open { all: unset; cursor: pointer; }
  .open:focus-visible { outline: 1px solid var(--text); }
  .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .text-link.danger { color: var(--danger); }
  .list .unit { display: none; }
  @container library (max-width: 26rem) {
    .list, .list tbody { display: block; }
    .list thead { display: none; }
    .list tbody tr { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "name name kind" "place size uses";
      column-gap: .75rem; row-gap: .125rem; align-items: baseline; min-height: 2.5rem; padding: .3rem .25rem; border-bottom: 1px solid var(--line); box-sizing: border-box; }
    .list th, .list td { padding: 0; border-bottom: none; }
    .list td { display: block; min-width: 0; }
    .list td:nth-child(1) { grid-area: name; }
    .list td.place { grid-area: place; font-size: var(--text-small); color: var(--muted); }
    .list td.kind { grid-area: kind; text-align: right; }
    .list td.size { grid-area: size; font-size: var(--text-small); }
    .list td.uses { grid-area: uses; font-size: var(--text-small); }
    .list .unit { display: inline; }
  }
  @container library (max-width: 20rem) {
    .line .field.grow { min-width: 0; flex-basis: 5rem; }
    .scope { grid-template-columns: 1fr; }
  }

  /* ── the browser ── */
  .browser-shade { position: fixed; inset: 0; z-index: 1000; display: flex; padding: 1.5rem; background: rgb(0 0 0 / .45); box-sizing: border-box; }
  .browser { flex: 1; min-width: 0; min-height: 0; display: grid; grid-template-columns: 13rem minmax(0, 1fr) 19rem; grid-template-rows: auto minmax(0, 1fr);
    background: var(--surface); color: var(--text); border: 1px solid var(--line); outline: none; font-size: var(--text-size); container: library / inline-size; }
  .browser.dragging { outline: 1px dashed var(--text); outline-offset: -3px; }
  .b-top { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: .375rem; padding: .375rem .75rem; border-bottom: 1px solid var(--line); }
  .b-title { font-weight: 600; margin-right: .5rem; white-space: nowrap; }
  .b-search { flex: 0 1 26rem; min-width: 8rem; }
  .side { display: flex; flex-direction: column; gap: 1px; padding: .5rem; overflow: auto; border-right: 1px solid var(--line); background: var(--surface-head); }
  .side-head { margin: .75rem .375rem .25rem; color: var(--muted); font-size: var(--text-small); letter-spacing: .08em; text-transform: uppercase; }
  .side-head:first-child { margin-top: .125rem; }
  .place { all: unset; box-sizing: border-box; display: flex; align-items: baseline; gap: .375rem; min-height: var(--control-height); padding: .25rem .375rem; cursor: pointer; overflow-wrap: anywhere; }
  .place .n { margin-left: auto; }
  @media (hover: hover) { .place:not(:disabled):hover { background: var(--hover-background); } }
  .place.on { background: var(--text); color: var(--surface); }
  .place.on .muted { color: inherit; }
  .place:disabled { opacity: .45; cursor: not-allowed; }
  .place:focus-visible { outline: 1px solid var(--text); outline-offset: -1px; }
  .center { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .b-bar { display: flex; align-items: center; gap: .375rem; padding: .375rem .75rem; border-bottom: 1px solid var(--line); }
  .b-notices { padding: 0 .75rem; }
  .b-body { flex: 1; min-height: 0; overflow: auto; padding: 0 .75rem 4rem; }
  .detail { min-width: 0; padding: .75rem; overflow: auto; border-left: 1px solid var(--line); }
  .multibar { position: absolute; left: 50%; bottom: .75rem; transform: translateX(-50%); display: flex; align-items: center; gap: .375rem; max-width: calc(100% - 1.5rem);
    padding: .375rem .5rem .375rem .75rem; border: 1px solid var(--text); background: var(--surface); box-shadow: 0 .25rem 1rem rgb(0 0 0 / .2); white-space: nowrap; }
  .multibar .field { width: 16rem; }
  @media (max-width: 64rem) {
    .browser-shade { padding: .5rem; }
    .browser { grid-template-columns: 11rem minmax(0, 1fr) 15rem; }
  }
</style>
