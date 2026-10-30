/**
 * The **Info view**'s help (like Ableton's): the name and description of the control under the pointer or in focus.
 * Panels keep no explanatory text of their own; a control (or a row, or any element around it) carries it:
 *
 * - `data-help="…"` – the description; `data-help-name="…"` names it (else the element's `aria-label`, the row's
 *   `.label`, or its own short text);
 * - without `data-help`, a `title` is the description (the tooltips the controls already have).
 *
 * The innermost element with a description wins. `help.listen(document)` (the Info view does it) follows the pointer
 * and the focus; when the pointer is over nothing with help, the focused control's help shows. The view's open state
 * is stored (`osct-editor-info`).
 */

import { readStored, writeStored } from "#lib/storage.js";

export interface HelpEntry {
  name: string;
  text: string;
}

const OPEN_KEY = "osct-editor-info";
/** Longer own text is content, not a name */
const NAME_MAX = 40;

const clean = (value: string | null | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();

/** The name of a help-carrying element: stated, its aria label, its row's label, or its own short text */
const nameOf = (element: Element): string => {
  const stated = clean(element.getAttribute("data-help-name")) || clean(element.getAttribute("aria-label"));
  if (stated) return stated;
  const row = element.closest(".row");
  const label = clean(row?.querySelector(":scope > .label")?.textContent);
  if (label) return label;
  const own = clean(element.textContent);
  return own.length <= NAME_MAX ? own : "";
};

/** The help of an element: the innermost element (itself or around it) with `data-help` or a `title` */
export const helpOf = (element: Element | null): HelpEntry | null => {
  for (let at: Element | null = element; at; at = at.parentElement) {
    const text = at.hasAttribute("data-help") ? clean(at.getAttribute("data-help")) : clean(at.getAttribute("title"));
    if (text) return { name: nameOf(at), text };
  }
  return null;
};


class Help {
  /** What the Info view shows */
  current = $state<HelpEntry | null>(null);
  /** The Info view is open (stored) */
  open = $state(readStored(OPEN_KEY) !== "closed");
  #hovered: HelpEntry | null = null;
  #focused: HelpEntry | null = null;

  setOpen(open: boolean) {
    this.open = open;
    writeStored(OPEN_KEY, open ? "open" : "closed");
  }

  /** The pointer moved onto an element (null = it left the page) */
  hover(element: Element | null) {
    this.#hovered = helpOf(element);
    this.#show();
  }

  /** The focus moved to an element (null = nothing focused) */
  focus(element: Element | null) {
    this.#focused = helpOf(element);
    this.#show();
  }

  #show() {
    const next = this.#hovered ?? this.#focused;
    if (next?.name === this.current?.name && next?.text === this.current?.text) return;
    this.current = next;
  }

  /** Follow the pointer and the focus in a document; returns the function that stops it */
  listen(root: Document) {
    const over = (event: Event) => this.hover(event.target instanceof Element ? event.target : null);
    const out = (event: PointerEvent) => { if (!event.relatedTarget) this.hover(null); };
    const focusIn = (event: FocusEvent) => this.focus(event.target instanceof Element ? event.target : null);
    const focusOut = (event: FocusEvent) => { if (!event.relatedTarget) this.focus(null); };
    root.addEventListener("pointerover", over);
    root.addEventListener("pointerout", out);
    root.addEventListener("focusin", focusIn);
    root.addEventListener("focusout", focusOut);
    return () => {
      root.removeEventListener("pointerover", over);
      root.removeEventListener("pointerout", out);
      root.removeEventListener("focusin", focusIn);
      root.removeEventListener("focusout", focusOut);
      this.#hovered = null;
      this.#focused = null;
      this.current = null;
    };
  }
}

export const help = new Help();
