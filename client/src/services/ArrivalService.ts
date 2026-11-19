import { API_URL } from "./ApiService";

/**
 * Arrivals by source (#324, docs/server.md "Arrivals"): a printed QR code or a link may carry `?s=<source>` – the
 * book's code is `?s=bk1`, the desktop landing page's `?s=lp1` (`LANDING_SOURCE`). On arrival the app reports it once
 * to the API – the source, the device class and whether this browser had never reported one before (a flag in its own
 * storage) – and takes `s` out of the address, so a reload or a shared link does not count again. No cookie goes with
 * it (`credentials: "omit"`), and the server keeps counts only.
 */
export const SOURCE_PARAM = "s";
/** The desktop landing page's own QR code (`<desktop-landing>`) */
export const LANDING_SOURCE = "lp1";
/** The browser reported an arrival before: the next one is no first arrival */
export const ARRIVED_KEY = "osct-arrived";
const SOURCE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export type DeviceClass = "phone" | "tablet" | "desktop";

/** The device class from the browser's user agent and pointer – no more than that is sent */
export const deviceClass = (win: Window = window): DeviceClass => {
  const nav = win.navigator;
  const ipad = nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
  if (ipad || /iPad|Tablet/i.test(nav.userAgent) || (/Android/i.test(nav.userAgent) && !/Mobile/i.test(nav.userAgent))) return "tablet";
  if (/Android|iPhone|iPod|Mobi/i.test(nav.userAgent)) return "phone";
  return "desktop";
};

/** The source in an address (lowercase), or null when it has none or a malformed one */
export const sourceOf = (href: string): string | null => {
  const source = new URL(href).searchParams.get(SOURCE_PARAM)?.trim().toLowerCase() ?? "";
  return SOURCE.test(source) ? source : null;
};

/** An address with `s` taken out (the rest as it was) */
export const withoutSource = (href: string): string => {
  const url = new URL(href);
  url.searchParams.delete(SOURCE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
};

const storage = (win: Window): Storage | null => {
  try {
    return win.localStorage;
  } catch {
    return null;
  }
};

/**
 * Reads `?s=` from the address, takes it out and reports the arrival in the background (a failure is dropped: the
 * count is a nicety, never in the reader's way). Returns the source, or null without one.
 */
export const reportArrival = (win: Window = window, apiUrl: string = API_URL): string | null => {
  const href = win.location.href;
  if (!new URL(href).searchParams.has(SOURCE_PARAM)) return null;
  win.history.replaceState(win.history.state, "", withoutSource(href));
  const source = sourceOf(href);
  if (!source || !apiUrl) return source;
  const store = storage(win);
  let first = false;
  try {
    first = store?.getItem(ARRIVED_KEY) !== "1";
    store?.setItem(ARRIVED_KEY, "1");
  } catch {
    first = false;
  }
  void win.fetch(`${apiUrl}/arrivals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, device: deviceClass(win), first }),
    credentials: "omit",
    keepalive: true,
  }).catch(() => {});
  return source;
};
