<script lang="ts">
  import { createExperience, errorText } from "#lib/api.js";
  import { readerAddress, slugCheck, slugFromTitle } from "#lib/new-experience.js";

  /**
   * **New experience** (#343, `POST /editor/experiences`): a title and a slug make an empty draft – one scene, nothing on
   * it. The slug is the experience's id, its reader address `https://<instance>/<slug>/` (shown as it is typed) and its
   * content store's folder; it is proposed from the title until the person types one, checked as the API checks it, and
   * never changes – once published, printed codes depend on it. The experiences page shows it above the import.
   */
  let { existing, ondone }: { existing: readonly string[]; ondone: (experienceId: string) => void } = $props();

  const origin = typeof location === "undefined" ? "" : location.origin;
  let title = $state("");
  let typed = $state<string | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const slug = $derived(typed ?? slugFromTitle(title));
  const problem = $derived(title.trim() || typed !== null ? slugCheck(slug, existing) : null);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!title.trim() || problem || !slug) return;
    busy = true;
    error = null;
    try {
      const { experience } = await createExperience({ id: slug, title: title.trim() });
      title = "";
      typed = null;
      ondone(experience.id);
    } catch (e) {
      error = errorText(e, { code: true });
    } finally {
      busy = false;
    }
  };
</script>

<form class="new" onsubmit={submit}>
  <h2>New experience</h2>
  <p class="lead muted">An empty draft with one scene – give it a title and a slug, its address in the reader.</p>
  <label class="stack"><span class="label">title</span>
    <input class="field" bind:value={title} maxlength="200" required placeholder="Onion Skin & Crocodile Tears"
      data-help-name="Title" data-help="The experience's title – the reader's home screen name and splash. It can be changed later." /></label>
  <label class="stack"><span class="label">slug</span>
    <input class="field slug" value={slug} oninput={e => (typed = (e.currentTarget as HTMLInputElement).value.trim().toLowerCase())}
      maxlength="64" autocomplete="off" spellcheck="false" placeholder="onion-skin" aria-invalid={problem ? "true" : undefined}
      data-help-name="Slug" data-help="The experience's id and its address in the reader – https://<instance>/<slug>/ – and the folder of its content on the CDN: lower-case letters, digits and dashes, none of the site's own paths (editor, api, docs, scene, …). It can't be changed later: once the experience is published, printed QR codes and shared links depend on it." /></label>
  <p class="small address" class:muted={!slug || problem}>Reader: <code>{readerAddress(origin, slug || "<slug>")}</code></p>
  <p class="small muted">The slug can't be changed once the experience is published – printed codes depend on it.</p>
  {#if problem}<p class="danger small" role="alert">{problem}</p>{/if}
  {#if error}<p class="danger small">{error}</p>{/if}
  <p class="actions">
    <button type="submit" class="pill primary" disabled={busy || !title.trim() || !slug || problem !== null}>{busy ? "Creating…" : "Create the experience"}</button>
  </p>
</form>

<style>
  .new { display: grid; gap: .875rem; }
  h2 { font-size: 1.125rem; font-weight: 600; margin: 0; }
  .lead { margin: -.375rem 0 .25rem; font-size: .8125rem; line-height: 1.45; }
  .stack { display: grid; gap: .3125rem; }
  .stack > .label { color: var(--muted); font-size: var(--text-small); letter-spacing: .06em; text-transform: uppercase; }
  .field { width: 100%; height: 2.125rem; background: var(--surface); }
  .slug { font-family: var(--mono, monospace); }
  p { margin: 0; line-height: 1.45; }
  .address { overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; margin: .25rem 0 0; }
  .actions .pill { min-height: 2.125rem; height: auto; padding: .375rem 1.25rem; text-align: left; }
</style>
