<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import type { Asset } from "#lib/api.js";
  import { cleanAssetName, nameStem, storedExtension } from "#lib/library-drag.js";
  import { formatDuration, formatSize } from "#lib/library-place.js";
  import { formatOf } from "#lib/library-scope.js";
  import Icon from "#lib/components/Icon.svelte";
  import CreditsField from "#lib/components/CreditsField.svelte";
  import AssetThumb from "./AssetThumb.svelte";

  /**
   * The selected Library file in detail (#330) – the panel's drawer at its bottom (`wide`: the preview beside the facts)
   * and the browser's right column: a preview (a video plays), the name, kind · dimensions · duration · size · format,
   * where it comes from and when, **used in** (each use a link to where it is – `uses[i].jump`, else plain words), the
   * credits line (✎ edits it: `CreditsField`) and the actions the panel passes (`actions`).
   */
  let { asset, label, kind, uses, wide = false, actions, extra, onclose, renaming = $bindable(false), onrename }: {
    /** The name's field is open (*Rename*, or F2 on the selected tile – #330) */
    renaming?: boolean;
    /** Saves a name given by hand: null when saved, else why not */
    onrename?: (name: string) => Promise<string | null>;
    asset: Asset;
    label: string;
    /** The file's kind in words (`target image`, `surface`, `video`) */
    kind: string;
    /** Where it is used: null while the uses load */
    uses: readonly { text: string; jump?: (() => void) | null }[] | null;
    /** The drawer: the preview beside the facts */
    wide?: boolean;
    actions: Snippet;
    /** Under the facts: a stack's levels (#331) */
    extra?: Snippet;
    onclose?: () => void;
  } = $props();

  let crediting = $state(false);
  $effect(() => {
    void asset.id;
    crediting = false;
    untrack(() => (renaming = false));
  });

  // ── the rename (#330): the name before the stored extension is edited, the extension stays; Enter or leaving the field
  // saves (edits save themselves, RULES #37), Esc keeps the old name. The URL never changes. ──
  const extension = $derived(storedExtension(asset));
  let draft = $state("");
  let renameProblem = $state<string | null>(null);
  let saving = false;
  $effect(() => {
    if (!renaming) return;
    untrack(() => {
      draft = nameStem(asset.name, extension);
      renameProblem = null;
    });
  });
  const focusField = (node: HTMLInputElement) => {
    node.focus();
    node.select();
  };
  const saveName = async () => {
    if (!renaming || saving || !onrename) return;
    const clean = cleanAssetName(draft, extension);
    if ("problem" in clean) {
      renameProblem = clean.problem;
      return;
    }
    if (clean.name === asset.name) {
      renaming = false;
      return;
    }
    saving = true;
    renameProblem = await onrename(clean.name);
    saving = false;
    if (!renameProblem) renaming = false;
  };
  const renameKey = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveName();
    } else if (event.key === "Escape") {
      // the Library's Esc (close the browser, cancel a pick) waits
      event.preventDefault();
      event.stopPropagation();
      renaming = false;
    }
  };

  const facts = $derived(
    [kind, asset.width && asset.height ? `${asset.width} × ${asset.height} px` : "", asset.durationMs ? formatDuration(asset.durationMs) : "", formatSize(asset.size), formatOf(asset)]
      .filter(Boolean).join(" · "),
  );
  const added = $derived.by(() => {
    const at = Date.parse(asset.createdAt);
    // An imported file has no date of its own (its createdAt is the epoch): none is shown
    return Number.isFinite(at) && at > 0 ? new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
  });
</script>

<section class="details" class:wide aria-label="The file {label}">
  <div class="preview">{#key asset.url}<AssetThumb {asset} square />{/key}</div>
  <div class="facts">
    <div class="head">
      {#if renaming}
        <span class="rename">
          <input class="field" bind:value={draft} aria-label="The file's name" aria-invalid={!!renameProblem} maxlength={255} spellcheck="false"
            onkeydown={renameKey} onblur={() => void saveName()} {@attach focusField} />{#if extension}<span class="muted ext">.{extension}</span>{/if}
        </span>
      {:else}
        <h3 class="name" title={asset.url}>{label}</h3>
        {#if onrename}<button type="button" class="text-link" title="Rename (F2) – the name only, the URL and every use stay" onclick={() => (renaming = true)}>Rename</button>{/if}
      {/if}
      {#if onclose}<button type="button" class="icon-button" aria-label="Close the details" title="Close" onclick={onclose}><Icon name="close" /></button>{/if}
    </div>
    {#if renaming && renameProblem}<div class="small danger" role="alert">{renameProblem}</div>{/if}
    <div class="small muted">{asset.imported ? "imported" : "uploaded"}{#if added} · {added}{/if}{#if asset.version > 1} · version {asset.version}{/if}</div>
    <dl class="kv small">
      <dt>file</dt><dd>{facts}</dd>
      <dt>used in</dt>
      <dd class="uses">
        {#if uses === null}<span class="muted">…</span>
        {:else if !uses.length}<span class="muted">nowhere – unused</span>
        {:else}
          {#each uses as use, i (i)}
            {#if use.jump}<button type="button" class="use" title="Show it" onclick={use.jump}>{use.text}</button>
            {:else}<span class="use plain">{use.text}</span>{/if}
          {/each}
        {/if}
      </dd>
      <dt>credits</dt>
      <dd>
        {#if crediting}<CreditsField {asset} autofocus onclose={() => (crediting = false)} />
        {:else}<span class:muted={!asset.credits}>{asset.credits || "none"}</span>
          <button type="button" class="text-link" title="The picture credits – one line, as the book prints them" onclick={() => (crediting = true)}>Credits…</button>{/if}
      </dd>
    </dl>
    {#if extra}{@render extra()}{/if}
    <div class="actions">{@render actions()}</div>
  </div>
</section>

<style>
  .details { display: flex; flex-direction: column; gap: .5rem; min-width: 0; }
  .details.wide { display: grid; grid-template-columns: minmax(5rem, 9rem) minmax(0, 1fr); gap: .75rem; align-items: start; }
  .preview { min-width: 0; }
  .facts { display: flex; flex-direction: column; gap: .125rem; min-width: 0; }
  .head { display: flex; align-items: center; gap: .25rem; }
  .name { flex: 1; min-width: 0; margin: 0; font-size: var(--text-size); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head .icon-button, .head .text-link { flex: none; }
  .rename { flex: 1; min-width: 0; display: flex; align-items: center; gap: .125rem; }
  .rename .field { flex: 1; min-width: 0; }
  .rename .ext { flex: none; }
  .kv { display: grid; grid-template-columns: 3.75rem minmax(0, 1fr); gap: .2rem .5rem; margin: .375rem 0; }
  .kv dt { color: var(--muted); }
  .kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .uses { display: flex; flex-wrap: wrap; gap: .25rem; }
  .use { padding: 0 .375rem; border: 1px solid var(--line); background: var(--control-background); color: var(--text); font: inherit; line-height: 1.4; }
  button.use { cursor: pointer; }
  @media (hover: hover) { button.use:hover { background: var(--hover-background); border-color: var(--muted); } }
  .use.plain { color: var(--muted); }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .375rem; margin-top: .125rem; }
</style>
