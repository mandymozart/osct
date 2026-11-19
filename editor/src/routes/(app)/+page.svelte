<script lang="ts">
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import { errorText, listExperiences, type ExperienceSummary, type EnvironmentServing } from "#lib/api.js";
  import ImportForm from "#lib/ImportForm.svelte";
  import ExperienceCover from "#lib/ExperienceCover.svelte";
  import InfoView from "#lib/components/InfoView.svelte";
  import AiConnections from "#lib/AiConnections.svelte";
  import { PAGE_MM } from "#lib/surface-edit.js";

  /**
   * The editor's start (#153): the experiences of this instance as their covers on the left, the import of a new one on
   * the right. An experience says only where it is live – each environment serves one experience, the last one published
   * there. Under the experiences the AI connections with the guide to connect an AI agent (#142, #194) – connecting one is a first step of
   * working here.
   */
  let experiences = $state<ExperienceSummary[] | null>(null);
  let environments = $state<EnvironmentServing[]>([]);
  let error = $state<string | null>(null);

  const load = async () => {
    try {
      const data = await listExperiences();
      experiences = data.experiences;
      environments = data.environments;
      error = null;
    } catch (e) {
      error = errorText(e);
    }
  };
  onMount(() => void load());

  const strays = $derived(environments.filter(e => "error" in e || (e.experience && !experiences?.some(x => x.id === e.experience))));
</script>

<div class="split">
  <main class="shelf" style:--cover-ratio="{PAGE_MM.width} / {PAGE_MM.height}">
    <h1>Experiences</h1>
    {#if error}<p class="danger">{error}</p>{/if}
    {#if experiences === null && !error}
      <ul class="covers" aria-busy="true">
        {#each [0, 1] as i (i)}<li class="skeleton"><span class="cover-box"></span><span class="line"></span><span class="line short"></span></li>{/each}
      </ul>
    {:else if experiences?.length === 0}
      <p class="muted empty">No experience yet. Import one with <b>Import an experience</b>: the CDN, a URL or a file.
        <a class="text-link" href="/docs/tutorials/#bringing-in">How to bring an experience in</a></p>
    {:else if experiences}
      <ul class="covers">
        {#each experiences as experience (experience.id)}
          <li>
            <a href={resolve(`${experience.id}/`)} class="experience">
              <span class="cover-box"><ExperienceCover {experience} /></span>
              <span class="title">{experience.title}</span>
              {#if experience.experience.book}<span class="author muted">{experience.experience.book.author}</span>{/if}
              <span class="live" data-help-name="Live" data-help="Where the experience is live: each environment (local, staging, production) serves one experience – the last one published there. Draft = no environment serves it.">
                {#each experience.live ?? [] as l (l.env)}<span class="badge on" title={l.build ? `build ${l.build}` : undefined}>{l.env}</span>{:else}<span class="badge">draft</span>{/each}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
    {#each strays as e (e.env)}
      <p class="small muted" title="An environment whose experience is not among the experiences here, or whose content store cannot be read">
        {e.env}: {"error" in e ? "the content store cannot be read" : `serves ${e.experience}, an experience not imported here`}
      </p>
    {/each}
    <AiConnections />
  </main>

  <aside class="side">
    <div class="import">
      <ImportForm ondone={async id => { await load(); await goto(resolve(`${id}/`)); }} />
    </div>
    <InfoView />
  </aside>
</div>

<style>
  .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(20rem, 1fr); height: calc(100dvh - var(--top-height)); }
  .shelf { overflow-y: auto; padding: 2rem clamp(1rem, 4vw, 3.5rem) 3rem; }
  .side { display: flex; flex-direction: column; min-height: 0; background: var(--surface-head); border-left: 1px solid var(--line); }
  .import { flex: 1; overflow-y: auto; display: grid; align-content: center; justify-items: center; padding: 2rem clamp(1rem, 4vw, 3.5rem); }
  .import > :global(*) { width: 100%; max-width: 26rem; }
  @media (max-width: 47.9rem) {
    .split { grid-template-columns: minmax(0, 1fr); height: auto; }
    .shelf { overflow: visible; }
    .side { border-left: none; border-top: 1px solid var(--line); }
    .side > :global(.info) { display: none; }
  }

  h1 { font-size: 1.125rem; font-weight: 600; margin: 0 0 1.5rem; }
  .empty { font-size: .875rem; max-width: 32rem; }
  .empty a { white-space: nowrap; }
  .covers { list-style: none; margin: 0 0 1.5rem; padding: 0; display: grid; gap: 2.25rem 1.75rem; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); }
  @media (max-width: 47.9rem) { .covers { gap: 1.5rem 1rem; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); } }
  .experience { display: grid; gap: .1875rem; text-decoration: none; }
  .cover-box { display: block; aspect-ratio: var(--cover-ratio); margin-bottom: .5rem; border-radius: 2px; overflow: hidden; background: var(--surface-head);
    box-shadow: 0 0 0 1px var(--line), 0 1px 2px rgb(0 0 0 / .06), 0 8px 20px -8px rgb(0 0 0 / .18); transition: transform .2s, box-shadow .2s; }
  .experience:focus-visible .cover-box { transform: translateY(-3px);
    box-shadow: 0 0 0 1px var(--text), 0 2px 4px rgb(0 0 0 / .08), 0 16px 28px -10px rgb(0 0 0 / .28); }
  @media (hover: hover) {
    .experience:hover .cover-box { transform: translateY(-3px);
      box-shadow: 0 0 0 1px var(--text), 0 2px 4px rgb(0 0 0 / .08), 0 16px 28px -10px rgb(0 0 0 / .28); }
  }
  .experience:focus-visible { outline: none; }
  .title { font-size: .875rem; font-weight: 600; line-height: 1.25; }
  .author { font-size: var(--text-size); }
  .live { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .25rem; }
  .badge { font-size: var(--text-small); line-height: 1; padding: .1875rem .375rem; border: 1px solid var(--line); color: var(--muted); }
  .badge.on { color: var(--text); border-color: var(--text); }
  .badge.on::before { content: "● "; font-size: .75em; vertical-align: .1em; }

  .skeleton .cover-box { animation: pulse 1.4s ease-in-out infinite; }
  .skeleton .line { display: block; height: .75rem; width: 70%; border-radius: 2px; background: var(--surface-head); }
  .skeleton .line.short { width: 40%; }
  @keyframes pulse { 50% { opacity: .5; } }
</style>
