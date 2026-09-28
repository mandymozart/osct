// Responsive breakpoints in em (600 / 900 / 1200 px at the default 16 px): em-based media queries follow
// the reader's text size, so enlarged text switches to the narrower layout (accessibility)
export const BREAKPOINT_MOBILE = 37.5;
export const BREAKPOINT_TABLET = 56.25;
export const BREAKPOINT_DESKTOP = 75;

// Media query helpers (without parentheses for direct use in CSS)
export const MEDIA_QUERY = {
  MOBILE: `max-width: ${BREAKPOINT_MOBILE}em`,
  TABLET: `max-width: ${BREAKPOINT_TABLET}em`,
  DESKTOP: `min-width: ${BREAKPOINT_DESKTOP}em`
};
