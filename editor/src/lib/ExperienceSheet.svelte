<script lang="ts">
  import { tick } from "svelte";
  import { confirmationStep } from "@shared/api/errors";
  import { activateVersion, errorText, exportFileUrl, importExperience, listVersions, type Confirmation, type ExperienceSummary, type ImportBody, type ImportComparison, type PublishedVersion } from "#lib/api.js";
  import { readerAddress } from "#lib/new-experience.js";
  import { makeLiveQuestion, versionRows, type VersionRow } from "#lib/experiences-page.js";
  import ImportSource, { type LoadedSource } from "#lib/ImportSource.svelte";
  import ImportCompare from "#lib/ImportCompare.svelte";

  /**
   * A book's **sheet** in the experiences page's column (#348): its title, author and reader address; **Open** (the
   * editor), **Export** (the draft as one file to download – `GET …/export/file`, the import body Import reads back),
   * **Replace…** step by step (a source – file, URL or published –, then the comparison, then *Replace the draft*; readers
   * keep the live version until the next publish) and **Versions** – the publish log, the live mark per environment, and
   * *make live* for an older build of this instance's environment, after a confirm in words (`POST …/versions/{build}/activate`).
   */
  let { experience, ownEnv, published, view = $bindable("sheet"), onopen, onchanged }: {
    experience: ExperienceSummary;
    ownEnv: string | null;
    published: readonly { id: string; title: string }[];
    view?: "sheet" | "replace";
    onopen: () => void;
    /** Something changed on the server (a replace, make live): the page reads the experiences again */
    onchanged: () => Promise<void> | void;
  } = $props();

  const origin = typeof location === "undefined" ? "" : location.origin;
  let versions = $state<PublishedVersion[] | null>(null);
  let versionsError = $state<string | null>(null);
  let asking = $state<VersionRow | null>(null);
  let busy = $state(false);
  let actionError = $state<string | null>(null);
  let done = $state<string | null>(null);

  const loadVersions = async (id: string) => {
    try {
      const data = await listVersions(id);
      if (experience.id === id) {
        versions = data.versions;
        versionsError = null;
      }
    } catch (e) {
      if (experience.id === id) versionsError = errorText(e);
    }
  };
  $effect(() => {
    const id = experience.id;
    versions = null;
    asking = null;
    done = null;
    void loadVersions(id);
  });
  const rows = $derived(versions ? versionRows(versions, experience.live ?? [], ownEnv) : []);

  let confirmBox = $state<HTMLElement | null>(null);
  const ask = async (row: VersionRow) => {
    asking = row;
    actionError = null;
    done = null;
    await tick();
    confirmBox?.querySelector<HTMLButtonElement>("button.primary")?.focus();
  };
  const makeLive = async () => {
    if (!asking) return;
    busy = true;
    actionError = null;
    try {
      const result = await activateVersion(experience.id, asking.build);
      done = `The version of ${asking.when} is live on ${result.env}.`;
      asking = null;
      await onchanged();
      await loadVersions(experience.id);
    } catch (e) {
      actionError = errorText(e, { code: true });
    } finally {
      busy = false;
    }
  };

  // Replace…: the source, then the comparison the import answers, then the confirmed import
  let loaded = $state<LoadedSource | null>(null);
  let pending = $state<{ body: ImportBody; comparison: ImportComparison; confirmation: Confirmation; changed: boolean } | null>(null);
  let replaceError = $state<string | null>(null);
  const startReplace = () => {
    view = "replace";
    loaded = null;
    pending = null;
    replaceError = null;
    done = null;
  };
  const leaveReplace = () => {
    view = "sheet";
    pending = null;
  };
  const send = async (body: ImportBody) => {
    try {
      await importExperience(experience.id, body);
      pending = null;
      view = "sheet";
      done = "The draft was replaced. Readers keep the live version until you publish.";
      await onchanged();
    } catch (e) {
      const step = confirmationStep<ImportComparison>(e, "import");
      if (!step) throw e;
      const again: ImportBody = { ...body };
      delete again.confirm;
      pending = { body: again, comparison: step.shows, confirmation: step.confirmation, changed: step.changed };
    }
  };
  const compare = async () => {
    if (!loaded) return;
    busy = true;
    replaceError = null;
    try {
      await send({ ...loaded.body, rename: true });
    } catch (e) {
      replaceError = errorText(e, { code: true });
    } finally {
      busy = false;
    }
  };
  const confirmReplace = async () => {
    if (!pending) return;
    busy = true;
    replaceError = null;
    try {
      await send({ ...pending.body, confirm: pending.confirmation.id });
    } catch (e) {
      replaceError = errorText(e, { code: true });
    } finally {
      busy = false;
    }
  };
</script>

<div class="sheet">
  <header>
    <h2>{experience.title}</h2>
    {#if experience.experience.book?.author}<p class="muted">{experience.experience.book.author}</p>{/if}
    <p class="address"><code>{readerAddress(origin, experience.id)}</code></p>
  </header>

  {#if view === "replace"}
    <section class="replace" aria-label="Replace the draft">
      <h3>Replace the draft</h3>
      {#if pending}
        <ImportCompare comparison={pending.comparison} changed={pending.changed} {busy} error={replaceError} onconfirm={confirmReplace} oncancel={() => (pending = null)} />
      {:else}
        <p class="small muted">Readers keep the live version until you publish.</p>
        <ImportSource {published} into={experience.id} initial={published.some(p => p.id === experience.id) ? "cdn" : "file"} onloaded={l => (loaded = l)} />
        {#if replaceError}<p class="danger small" role="alert">{replaceError}</p>{/if}
        <p class="actions">
          <button type="button" class="pill primary" disabled={!loaded || busy} onclick={compare}>{busy ? "Comparing…" : "Compare"}</button>
          <button type="button" class="text-link" onclick={leaveReplace}>Cancel</button>
        </p>
      {/if}
    </section>
  {:else}
    <p class="actions">
      <button type="button" class="pill primary" onclick={onopen}>Open</button>
      <a class="pill framed" href={exportFileUrl(experience.id)} download
        data-help-name="Export" data-help="The draft as one file (.osct.json): its configuration, its files' list and its plugin code. Import (File) reads it back – here or on another instance. The media stay where they are; the file names them.">Export</a>
      <button type="button" class="pill framed" onclick={startReplace}
        data-help-name="Replace" data-help="Replace the draft with an export file, a URL or a published version – after a comparison. Readers keep the live version until you publish.">Replace…</button>
    </p>
    {#if done}<p class="small" role="status">{done}</p>{/if}

    <section class="versions" aria-label="Versions">
      <h3>Versions</h3>
      {#if versionsError}<p class="danger small">{versionsError}</p>
      {:else if versions === null}<p class="small muted" role="status">Reading the publish log…</p>
      {:else if rows.length === 0}<p class="small muted">Not published yet – Publish in the editor makes the first version.</p>
      {:else}
        <ul>
          {#each rows as row (row.id)}
            <li class:live={row.live}>
              <span class="when">{row.when}</span>
              <span class="env">{row.env}</span>
              <span class="who small muted">{row.who}{#if row.note} · {row.note.startsWith("Made live again") ? "made live again" : row.note}{/if}</span>
              <span class="state">
                {#if row.live}<span class="badge on" title="Readers of {row.env} get this version">live</span>
                {:else if row.canMakeLive}<button type="button" class="text-link" onclick={() => ask(row)} disabled={busy}
                  data-help-name="Make live" data-help="This version becomes the one readers of this environment get, on their next start. Builds are kept, so any older one can come back; the draft is not changed.">make live</button>{/if}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if asking}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="confirm" role="alertdialog" tabindex="-1" aria-label="Make live" aria-describedby="make-live-question" bind:this={confirmBox}
          onkeydown={e => { if (e.key === "Escape") { e.stopPropagation(); asking = null; } }}>
          <p id="make-live-question">{makeLiveQuestion(asking)}</p>
          {#if actionError}<p class="danger small" role="alert">{actionError}</p>{/if}
          <p class="actions">
            <button type="button" class="pill primary" onclick={makeLive} disabled={busy}>{busy ? "Making it live…" : "Make live"}</button>
            <button type="button" class="text-link" onclick={() => (asking = null)}>Cancel</button>
          </p>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .sheet { display: grid; gap: 1.25rem; }
  header { display: grid; gap: .25rem; }
  h2 { font-size: 1.125rem; font-weight: 600; margin: 0; }
  h3 { margin: 0 0 .5rem; color: var(--muted); font-size: var(--text-small); font-weight: 400; letter-spacing: .06em; text-transform: uppercase; }
  p { margin: 0; line-height: 1.45; }
  .address { overflow-wrap: anywhere; }
  code { font-family: var(--mono, ui-monospace, monospace); }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
  .actions .pill { min-height: 2.125rem; height: auto; padding: .375rem 1rem; text-decoration: none; }
  .replace { display: grid; gap: .875rem; }
  .versions ul { list-style: none; margin: 0; padding: 0; }
  .versions li { display: grid; grid-template-columns: 7.5rem 4.5rem minmax(0, 1fr) auto; gap: .5rem; align-items: baseline; padding: .375rem 0; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
  .versions li.live .when { font-weight: 600; }
  .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { font-size: var(--text-small); line-height: 1; padding: .1875rem .375rem; border: 1px solid var(--text); }
  .badge.on::before { content: "● "; font-size: .75em; vertical-align: .1em; }
  .confirm { display: grid; gap: .625rem; margin-top: .75rem; padding: .75rem; border: 1px solid var(--text); background: var(--surface); }
</style>
