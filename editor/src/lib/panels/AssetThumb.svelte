<script lang="ts">
  import type { Asset } from "#lib/api.js";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";

  /**
   * A library file's preview: an image, or a video's first frame (the poster) that plays muted and inline while
   * hovered or after a click (a second click stops it); the type's icon else. An animated skeleton until the picture
   * has loaded, the icon when it fails (the panel keys it by the URL: a replace loads again). A video only loads once
   * it scrolls into view – a book has hundreds.
   */
  let { asset }: { asset: Asset } = $props();

  const ICONS: Record<string, IconName> = { glb: "model", gltf: "model", video: "video", image: "image", audio: "layers" };
  let loaded = $state(false);
  let failed = $state(false);
  let visible = $state(false);
  let pinned = $state(false);
  let box = $state<HTMLElement>();
  let video = $state<HTMLVideoElement>();

  $effect(() => {
    if (asset.kind !== "video" || !box || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      visible = true;
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) visible = true;
    }, { rootMargin: "200px" });
    observer.observe(box);
    return () => observer.disconnect();
  });

  const play = () => void video?.play().catch(() => {});
  const stop = () => {
    if (!video || pinned) return;
    video.pause();
    video.currentTime = 0.1;
  };
  const toggle = () => {
    pinned = !pinned;
    if (pinned) play();
    else stop();
  };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="thumb" bind:this={box} onmouseenter={asset.kind === "video" ? play : undefined} onmouseleave={asset.kind === "video" ? stop : undefined} class:pending={(asset.kind === "image" || asset.kind === "video") && !loaded && !failed}>
  {#if asset.kind === "image" && !failed}
    <img src={asset.url} alt="" loading="lazy" decoding="async" class:loaded onload={() => (loaded = true)} onerror={() => (failed = true)} />
  {:else if asset.kind === "video" && !failed}
    {#if visible}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} src={`${asset.url}#t=0.1`} preload="metadata" muted playsinline loop class:loaded
        onloadeddata={() => (loaded = true)} onerror={() => (failed = true)}></video>
      <button type="button" class="play" class:on={pinned} aria-pressed={pinned} title={pinned ? "Stop" : "Play (muted)"} onclick={toggle}>
        <Icon name={pinned ? "pause" : "play"} size="0.9em" />
      </button>
    {/if}
  {:else}
    <Icon name={ICONS[asset.kind] ?? "layers"} size="1.75em" stroke={1.5} />
  {/if}
</div>

<style>
  .thumb { position: relative; display: flex; align-items: center; justify-content: center; aspect-ratio: 4 / 3; background: var(--surface-head); border-radius: var(--control-radius); overflow: hidden; color: var(--muted); }
  .thumb img, .thumb video { width: 100%; height: 100%; object-fit: contain; opacity: 0; transition: opacity .2s; }
  .thumb img.loaded, .thumb video.loaded { opacity: 1; }
  .thumb.pending::before { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, var(--hover-background), transparent); transform: translateX(-100%); animation: sweep 1.2s ease-in-out infinite; }
  @keyframes sweep { to { transform: translateX(100%); } }
  @media (prefers-reduced-motion: reduce) { .thumb.pending::before { animation: none; transform: none; background: var(--hover-background); } }
  .play { position: absolute; right: .25rem; bottom: .25rem; display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; padding: 0; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); opacity: .85; }
  .play.on { background: var(--pressed-background); color: var(--pressed-color); }
  @media (pointer: coarse) { .play { width: var(--control-height); height: var(--control-height); } }
</style>
