import { afterEach, describe, expect, it } from "vitest";
import { help, helpOf } from "../help.svelte";

const html = (markup: string) => {
  document.body.innerHTML = markup;
  return (selector: string) => document.querySelector(selector)!;
};

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("helpOf: the help of the control under the pointer", () => {
  it("takes the innermost data-help and its stated name", () => {
    const $ = html(`<div data-help="outer"><button data-help-name="Grid" data-help="A grid  over the page" id="b"><span id="s">x</span></button></div>`);
    expect(helpOf($("#s"))).toEqual({ name: "Grid", text: "A grid over the page" });
  });

  it("names a row's help by the row's label, a control by its aria label", () => {
    const $ = html(`<div class="row" data-help="Hand shake"><span class="label">shake</span><input id="i" /></div>
      <button id="c" aria-label="Close" data-help="Back to the spreads"></button>`);
    expect(helpOf($("#i"))).toEqual({ name: "shake", text: "Hand shake" });
    expect(helpOf($("#c"))).toEqual({ name: "Close", text: "Back to the spreads" });
  });

  it("falls back to a title; data-help wins over the title on the same element", () => {
    const $ = html(`<button id="a" title="Previous spread (←)">‹</button><button id="b" title="tooltip" data-help="help">b</button>`);
    expect(helpOf($("#a"))).toEqual({ name: "‹", text: "Previous spread (←)" });
    expect(helpOf($("#b"))?.text).toBe("help");
  });

  it("is null without any help around, and a long own text is no name", () => {
    const $ = html(`<p id="p">nothing</p><div title="t" id="d">${"word ".repeat(20)}</div>`);
    expect(helpOf($("#p"))).toBeNull();
    expect(helpOf($("#d"))).toEqual({ name: "", text: "t" });
  });
});

describe("help: pointer, focus and the open state", () => {
  it("shows the hovered control, else the focused one", () => {
    const $ = html(`<button id="a" data-help="A">a</button><button id="b" data-help="B">b</button><p id="p">none</p>`);
    help.focus($("#a"));
    expect(help.current?.text).toBe("A");
    help.hover($("#b"));
    expect(help.current?.text).toBe("B");
    help.hover($("#p"));
    expect(help.current?.text).toBe("A");
    help.focus(null);
    expect(help.current).toBeNull();
  });

  it("follows pointer and focus events of a document until stopped", () => {
    const $ = html(`<button id="a" data-help="A">a</button>`);
    const stop = help.listen(document);
    $("#a").dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(help.current?.text).toBe("A");
    stop();
    expect(help.current).toBeNull();
    $("#a").dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(help.current).toBeNull();
  });

  it("stores whether the Info view is open", () => {
    help.setOpen(false);
    expect(localStorage.getItem("osct-editor-info")).toBe("closed");
    expect(help.open).toBe(false);
    help.setOpen(true);
    expect(localStorage.getItem("osct-editor-info")).toBe("open");
  });
});
