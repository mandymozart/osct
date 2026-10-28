/**
 * The editor's icons: Feather (MIT, feathericons.com) outlines as inline SVG strings – stroke 2.5, square caps,
 * `currentColor`, sized by the font. Icons where a word makes no sense (step, replay, photo, close); words elsewhere.
 */
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  previous: svg('<polyline points="15 18 9 12 15 6"></polyline>'),
  next: svg('<polyline points="9 18 15 12 9 6"></polyline>'),
  replay: svg('<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>'),
  camera: svg('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>'),
  /** The close cross: two lines corner to corner, square, the stroke the boxes' rule */
  close: `<svg viewBox="0 0 10 10" width="0.7em" height="0.7em" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" aria-hidden="true"><line x1="0" y1="0" x2="10" y2="10"></line><line x1="10" y1="0" x2="0" y2="10"></line></svg>`,
} as const;
