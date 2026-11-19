<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Asset } from "#lib/api.js";
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
  let { asset, label, kind, uses, wide = false, actions, extra, onclose }: {
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
  });

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
      <h3 class="name" title={asset.url}>{label}</h3>
      {#if onclose}<button type="button" class="icon-button" aria-label="Close the details" title="Close" onclick={onclose}><Icon name="close" /></button>{/if}
    </div>
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
  .head .icon-button { flex: none; }
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
