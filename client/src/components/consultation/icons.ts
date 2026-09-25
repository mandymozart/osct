/**
 * Placeholder icons for bookmark and note (PLAN Phase 4) – the final icons come from Tilman.
 * Replace the SVGs here; they inherit `currentColor` and size with the font.
 */
const svg = (path: string, filled = false) =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${path}</svg>`;

const BOOKMARK_PATH = '<path d="M6 3h12v18l-6-4.5L6 21z"/>';
const NOTE_PATH = '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>';

export const ICONS = {
  bookmark: svg(BOOKMARK_PATH),
  bookmarked: svg(BOOKMARK_PATH, true),
  note: svg(NOTE_PATH),
};
