/**
 * The landing's own addresses (#324, #355): what its QR code opens and where its footer's Privacy & terms is. Pure, so the
 * reader (client/src/landing/links.ts, with this page's origin and path) and the editor (with the experience it shows)
 * build the same ones.
 */

/** The query parameter an arrival's source comes in (the reader counts it – client/src/services/ArrivalService.ts) */
export const SOURCE_PARAM = "s";
/** The desktop landing page's own QR code */
export const LANDING_SOURCE = "lp1";

/** The address the landing page's QR code opens: the experience (`/<experience>/`, #343), with the landing page as its source (`?s=lp1`) */
export const landingQrUrlOf = (origin: string, prefix: string): string => `${origin}${prefix}/?${SOURCE_PARAM}=${LANDING_SOURCE}`;

/** Privacy & terms: the static page beside the app (privacy.html) below the experience's path */
export const privacyHrefOf = (prefix: string): string => `${prefix}/privacy`;
