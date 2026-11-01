<script lang="ts">
  import { onMount } from "svelte";
  import { updated } from "$app/state";
  import { reloadDue, versionBar, type VersionAction } from "#lib/new-version.js";
  import { noticeStaleChunks } from "#lib/stale-chunks.js";
  import { hasUnsaved } from "#lib/unsaved.js";
  import Icon from "#lib/components/Icon.svelte";

  /**
   * The quiet bar when a new version of the editor is deployed (`new-version.ts`) – at the foot of the window, where it
   * covers no tool, and under the top bar on a phone, where the sheet takes the foot. SvelteKit polls `version.json`
   * (`version.pollInterval`, vite.config.ts) and the editor asks again whenever the tab gets the focus or becomes visible;
   * a code file that fails to load shows the bar too (`stale-chunks.ts`). *Reload* reloads; with unsaved edits *Reload
   * after saving* waits until nothing is left unsaved, *Reload now* drops them. The cross hides it until a code file fails
   * to load. Drawn by the layout on every page, the sign-in included.
   */
  let chunkFailed = $state(false);
  let waiting = $state(false);
  let dismissed = $state(false);

  const status = $derived({ ready: updated.current || chunkFailed, unsaved: hasUnsaved(), waiting, dismissed });
  const bar = $derived(versionBar(status));

  const reload = () => window.location.reload();
  const act = (action: VersionAction) => {
    if (action === "reload") reload();
    else waiting = true;
  };

  $effect(() => {
    if (reloadDue(status)) reload();
  });

  onMount(() => {
    const check = () => void updated.check();
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibility);
    const offStale = noticeStaleChunks(() => {
      chunkFailed = true;
      dismissed = false;
    });
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibility);
      offStale();
    };
  });
</script>

{#if bar}
  <div class="new-version" role="status" data-app-ui>
    <span class="text">{bar.text}</span>
    <span class="actions">
      {#each bar.actions as { action, label }, i (action)}
        <button type="button" class={i === 0 ? "pill primary" : "pill framed"} onclick={() => act(action)}>{label}</button>
      {/each}
      <button type="button" class="icon-button" aria-label="Later" title="Later – hide the bar; the next reload loads the new version"
        onclick={() => { dismissed = true; waiting = false; }}><Icon name="close" /></button>
    </span>
  </div>
{/if}

<style>
  .new-version { position: fixed; bottom: 1rem; left: 50%; z-index: 25; transform: translateX(-50%);
    display: flex; align-items: center; gap: .25rem .75rem; max-width: calc(100vw - 1rem); white-space: nowrap;
    padding: .25rem .25rem .25rem .75rem; border: 1px solid var(--line); background: var(--surface); color: var(--text);
    box-shadow: 0 8px 24px -8px rgb(0 0 0 / .25); }
  .text { overflow: hidden; text-overflow: ellipsis; }
  .actions { display: flex; align-items: center; gap: .25rem; margin-left: auto; }
  @media (max-width: 47.9rem) {
    .new-version { top: calc(var(--top-height) + .25rem); bottom: auto; left: .5rem; right: .5rem; flex-wrap: wrap; max-width: none; transform: none; white-space: normal; }
    .text { flex: 1 1 12rem; line-height: 1.45; }
  }
</style>
