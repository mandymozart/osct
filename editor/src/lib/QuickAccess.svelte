<script lang="ts">
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import { errorText, recentChanges, type RecentChange } from "#lib/api.js";
  import { session } from "#lib/session.svelte.js";
  import { recentPlaces } from "#lib/experiences-page.js";
  import Icon from "#lib/components/Icon.svelte";

  /**
   * The Experiences workspace's Inspector while no book is selected (#348, Tilman: "nothing is clicked, the right side shows cards
   * new experience and import and last worked on. so we use it as quick access menu"): **New experience** and **Import**,
   * and **Last worked on** – the newest places across the instance's experiences from the server's change history
   * (`GET /editor/recent`): book · scene (· entry or panel) · when · who (when not you); a click opens that place.
   */
  let { initialScenes, onnew, onimport }: {
    /** Each experience's first scene – a change on no scene opens its panel there */
    initialScenes: Readonly<Record<string, string>>;
    onnew: () => void;
    onimport: () => void;
  } = $props();

  let changes = $state<RecentChange[] | null>(null);
  let error = $state<string | null>(null);
  let now = $state(Date.now());
  onMount(() => {
    recentChanges(60).then(data => (changes = data.changes), e => (error = errorText(e)));
    const timer = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(timer);
  });
  /** The editor's address of a place (`osct/p1/?tab=code`) */
  const href = (path: string): string => {
    const [where, query] = path.split("?") as [`${string}/`, string | undefined];
    return `${resolve(`${where}`)}${query ? `?${query}` : ""}`;
  };
  const rows = $derived(changes ? recentPlaces(changes, session.user?.email ?? null, now, 5, initialScenes) : []);
</script>

<div class="quick">
  <div class="cards">
    <button type="button" class="card" onclick={onnew} data-help-name="New experience" data-help="Make a new experience step by step: empty with one scene, or from an export – then its title and its address.">
      <Icon name="plus" /><b>New experience</b><span class="muted small">Empty, step by step</span></button>
    <button type="button" class="card" onclick={onimport} data-help-name="Import" data-help="Bring an experience in as a new one: an export file, a URL or a version published on this instance's CDN.">
      <Icon name="download" /><b>Import</b><span class="muted small">File, URL or published</span></button>
  </div>

  <section class="recent" aria-labelledby="recent-head">
    <h3 id="recent-head">Last worked on</h3>
    {#if error}<p class="danger small">{error}</p>
    {:else if changes === null}<p class="small muted" role="status">Reading the history…</p>
    {:else if rows.length === 0}<p class="small muted">Nothing yet – the places you and others work on show here.</p>
    {:else}
      <ul>
        {#each rows as row (row.path + row.when)}
          <li>
            <a href={href(row.path)}>
              <span class="where"><b>{row.book}</b>{" · "}{row.place}{#if row.detail}<span class="muted">{" · "}{row.detail}</span>{/if}</span>
              <span class="when small muted">{row.when}{#if row.who}{" · "}{row.who}{/if}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .quick { display: grid; gap: 2rem; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
  .card { display: grid; gap: .375rem; justify-items: start; padding: 1rem; text-align: left; border: 1px solid var(--line); background: var(--surface); cursor: pointer; }
  @media (hover: hover) { .card:hover { border-color: var(--text); } }
  .card b { font-size: .875rem; font-weight: 600; }
  h3 { margin: 0 0 .5rem; color: var(--muted); font-size: var(--text-small); font-weight: 400; letter-spacing: .06em; text-transform: uppercase; }
  p { margin: 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  li a { display: grid; gap: .125rem; padding: .5rem 0; border-bottom: 1px solid var(--line); text-decoration: none; }
  li:first-child a { border-top: 1px solid var(--line); }
  @media (hover: hover) { li a:hover .where { text-decoration: underline; } }
  .where { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .where b { font-weight: 600; }
</style>
