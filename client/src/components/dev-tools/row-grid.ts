/**
 * The vertical grid's debug overlay (#295, DESIGN.md §3a): `<html data-row-grid>` draws the six rows over every
 * screen (main.css). The debug overlay's "Grid" switch turns it on and off; the choice is kept on this device.
 */
const KEY = "osct.debug.rowGrid";

export const isRowGridShown = (): boolean => document.documentElement.hasAttribute("data-row-grid");

export const showRowGrid = (on: boolean): void => {
  document.documentElement.toggleAttribute("data-row-grid", on);
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // No storage (private mode): the overlay stays for this visit only
  }
};

/** Shows the overlay again when it was on at the last visit */
export const restoreRowGrid = (): void => {
  try {
    if (localStorage.getItem(KEY) === "1") document.documentElement.setAttribute("data-row-grid", "");
  } catch {
    // No storage: nothing to restore
  }
};
