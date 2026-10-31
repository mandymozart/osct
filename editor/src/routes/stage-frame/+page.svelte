<script lang="ts">
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import { startStageFrame } from "#lib/stage/frame-host.svelte.js";

  /**
   * The stage frame's document (#234, docs/editor.md "The stage frame"): the workspace loads it into an iframe sandboxed
   * without `allow-same-origin`, and the stage – the engine with the book's plugins and the Code tab's Run – runs here, in
   * an opaque origin without the session. Outside the editor's `(app)` routes: no sign-in gate, no API, no top bar.
   */
  let container = $state<HTMLDivElement>();
  // Absolute, whatever form the base takes: the policy names it with the origin
  const appBase = new URL(resolve("/(app)"), location.href).pathname;
  const apiBase = ((import.meta.env.VITE_API_URL as string | undefined) ?? "/api").replace(/\/+$/, "");
  const devSocket = import.meta.env.DEV ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${appBase}` : null;

  onMount(() => startStageFrame(container!, { appBase, apiBase, devSocket }));
</script>

<svelte:head>
  <title>OSCT Stage</title>
</svelte:head>

<div class="frame" bind:this={container}></div>

<style>
  :global(html), :global(body) { margin: 0; height: 100%; overflow: hidden; background: transparent; }
  .frame { position: fixed; inset: 0; }
  .frame :global(canvas) { display: block; width: 100%; height: 100%; }
</style>
