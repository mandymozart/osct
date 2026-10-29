<script lang="ts" module>
  /**
   * Feather icons (MIT, feathericons.com) as inline SVG – stroke 2.5, square caps, `currentColor`, sized by the font.
   * Only where a word makes no sense (RULES #32): step, replay, photo, close, the linked scale, the tree's folds.
   */
  export const ICONS = {
    previous: '<polyline points="15 18 9 12 15 6"></polyline>',
    next: '<polyline points="9 18 15 12 9 6"></polyline>',
    replay: '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>',
    close: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
    reset: '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>',
    up: '<polyline points="18 15 12 9 6 15"></polyline>',
    down: '<polyline points="6 9 12 15 18 9"></polyline>',
    /** Uniform scale: the three axes linked (Blender's chain) */
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>',
  } as const;
  export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
  let { name, size = "1.1em" }: { name: IconName; size?: string } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
  {@html ICONS[name]}
</svg>
