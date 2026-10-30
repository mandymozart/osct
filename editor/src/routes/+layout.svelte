<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { session } from "#lib/session.svelte.js";
  import SignIn from "#lib/SignIn.svelte";
  import TopBar from "#lib/TopBar.svelte";
  import { reloadOnStaleChunks } from "#lib/reload-on-stale.js";

  let { children } = $props();

  onMount(() => void session.restore());
  // A deploy replaced the code files under this tab: a chunk that fails to load reloads the page once (#160)
  onMount(() => reloadOnStaleChunks());

  /** The admin page (docs/admin.md) is for admins, everything else for editors – an account may be both */
  const isAdminRoute = $derived(`${page.url.pathname}/` === resolve("admin/") || page.url.pathname.startsWith(resolve("admin/")));
  const allowed = $derived(isAdminRoute ? session.isAdmin : session.isEditor);
</script>

<svelte:head>
  <title>{isAdminRoute ? "OSCT Admin" : "OSCT Editor"}</title>
</svelte:head>

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
      {#if session.isEditor}<p><a href={resolve("/")} class="pill framed">To the editor</a></p>{/if}
    {:else}
      <h1>No editor access</h1>
      <p>{session.user?.email} is signed in, but not an editor of this instance. An admin grants the role on the
        admin page (docs/admin.md).</p>
      {#if session.isAdmin}<p><a href={resolve("admin/")} class="pill framed">To the admin page</a></p>{/if}
    {/if}
    <p><button type="button" class="pill framed" onclick={() => session.signOut()}>Sign out</button></p>
  </main>
{:else}
  <TopBar />
  {@render children()}
{/if}

<style>
  .gate { max-width: 24rem; margin: 0 auto; padding: 4rem 1rem; }
  h1 { font-size: 1rem; font-weight: 600; margin: 0 0 .5rem; }
  code { font-size: var(--text-small); }
  a.pill { text-decoration: none; }
</style>
