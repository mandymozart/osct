<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { session } from "$lib/session.svelte";
  import SignIn from "$lib/SignIn.svelte";

  let { children } = $props();

  onMount(() => void session.restore());
</script>

<svelte:head>
  <title>OSCT Editor</title>
</svelte:head>

{#if session.status === "unknown"}
  <main class="gate"><p class="muted">Checking the session…</p></main>
{:else if session.status === "out"}
  <main class="gate"><SignIn /></main>
{:else if !session.isEditor}
  <main class="gate">
    <h1>No editor access</h1>
    <p>{session.user?.email} is signed in, but not an editor of this instance. An admin makes one with
      <code>POST /api/admin/editors</code> (docs/server.md).</p>
    <p><button type="button" class="pill framed" onclick={() => session.signOut()}>Sign out</button></p>
  </main>
{:else}
  {@render children()}
{/if}

<style>
  .gate { max-width: 24rem; margin: 0 auto; padding: 4rem 1rem; }
  h1 { font-size: 1rem; font-weight: 600; margin: 0 0 .5rem; }
  code { font-size: var(--text-small); }
</style>
