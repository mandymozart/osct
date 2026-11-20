<script lang="ts">
  import "../../app.css";
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { isAdminPath, session } from "#lib/session.svelte.js";
  import { guardUnsavedOnLeave } from "#lib/autosave.svelte.js";
  import SignIn from "#lib/SignIn.svelte";
  import TopBar from "#lib/TopBar.svelte";
  import NewVersionBar from "#lib/NewVersionBar.svelte";
  import { markRender, RENDER_PARAM } from "#lib/render-view.js";

  let { children } = $props();

  onMount(() => void session.restore());
  // Edits save themselves: leaving the page writes what still waits
  onMount(guardUnsavedOnLeave);

  /** The admin page (docs/admin.md) is for admins, everything else for editors – an account may be both */
  const isAdminRoute = $derived(isAdminPath(page.url.pathname));
  const allowed = $derived(isAdminRoute ? session.isAdmin : session.isEditor);
  /** The render view of a scene (#89, render-view.ts): the stage alone – no top bar, no new-version bar */
  const rendering = $derived(page.url.searchParams.has(RENDER_PARAM));
  // …and a render the gate stops says why, for the renderer
  $effect(() => {
    if (!rendering) return;
    if (session.status === "out") markRender("error", "Not signed in – the API refused the token.");
    else if (session.status === "in" && !allowed) markRender("error", "The token's account has no editor role.");
  });
</script>

<svelte:head>
  <title>{isAdminRoute ? "OSCT Admin" : "OSCT Editor"}</title>
</svelte:head>

<!-- A deploy under this open tab: the bar offers the new version, on every page -->
{#if !rendering}<NewVersionBar />{/if}

{#if session.status === "unknown"}
  <main class="gate"><p class="muted">Checking the session…</p></main>
{:else if session.status === "out"}
  <main class="gate"><SignIn /></main>
{:else if !allowed}
  <main class="gate">
    {#if isAdminRoute}
      <h1>No admin access</h1>
      <p>{session.user?.email} is signed in, but not an admin of this instance. An admin grants the role on this page,
        or the deployment's <code>ADMINS</code> list does at sign-in (docs/server.md "Roles").</p>
      {#if session.isEditor}<p><a href={resolve("/(app)")} class="pill framed">To the editor</a></p>{/if}
    {:else}
      <h1>No editor access</h1>
      <p>{session.user?.email} is signed in, but not an editor of this instance. An admin grants the role on the
        admin page (docs/admin.md).</p>
      {#if session.isAdmin}<p><a href={resolve("admin/")} class="pill framed">To the admin page</a></p>{/if}
    {/if}
    <p><button type="button" class="pill framed" onclick={() => session.signOut()}>Sign out</button></p>
  </main>
{:else}
  {#if !rendering}<TopBar />{/if}
  {@render children()}
{/if}

<style>
  .gate { max-width: 24rem; margin: 0 auto; padding: 4rem 1rem; }
  h1 { font-size: 1rem; font-weight: 600; margin: 0 0 .5rem; }
  code { font-size: var(--text-small); }
  a.pill { text-decoration: none; }
</style>
