// Global application constants

// Responsive breakpoints (in pixels)
export const BREAKPOINT_MOBILE = 600;
export const BREAKPOINT_TABLET = 900;
export const BREAKPOINT_DESKTOP = 1200;

// Media query helpers (without parentheses for direct use in CSS)
export const MEDIA_QUERY = {
  MOBILE: `max-width: ${BREAKPOINT_MOBILE}px`,
  TABLET: `max-width: ${BREAKPOINT_TABLET}px`,
  DESKTOP: `min-width: ${BREAKPOINT_DESKTOP}px`
};