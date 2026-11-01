import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import Toggle from "../components/Toggle.svelte";
import { isSwitchKey, switchKeyDown } from "../components/toggle-keys.ts";

// The editor's switch is a track with a knob, not a pill that reads on / off (#243)

describe("toggle-keys: which keys flip a switch", () => {
  it("Space and Enter flip it, once per press – a held key's repeats only cancel the default", () => {
    expect(isSwitchKey(" ")).toBe(true);
    expect(isSwitchKey("Enter")).toBe(true);
    expect(switchKeyDown(" ", false)).toBe("flip");
    expect(switchKeyDown("Enter", false)).toBe("flip");
    expect(switchKeyDown("Enter", true)).toBe("cancel");
  });

  it("other keys do nothing (Tab moves on, arrows stay the page's)", () => {
    for (const key of ["Tab", "ArrowRight", "a", "Escape"]) expect(switchKeyDown(key, false)).toBe("none");
  });
});

describe("Toggle.svelte", () => {
  let component: ReturnType<typeof mount> | undefined;
  afterEach(() => {
    if (component) unmount(component);
    component = undefined;
    document.body.innerHTML = "";
  });

  /** Mount a switch that keeps its own state, as its users do, and record every change */
  function render(props: { on?: boolean; disabled?: boolean; words?: readonly [string, string] } = {}) {
    const changes: boolean[] = [];
    const state = $state({ on: props.on ?? false });
    component = mount(Toggle, {
      target: document.body,
      props: {
        get on() { return state.on; },
        label: "Snap",
        words: props.words,
        disabled: props.disabled,
        onchange: (on: boolean) => { changes.push(on); state.on = on; },
      },
    });
    flushSync();
    const button = document.body.querySelector("button")!;
    return { button, changes };
  }

  const press = (button: HTMLElement, key: string, repeat = false) => {
    button.dispatchEvent(new KeyboardEvent("keydown", { key, repeat, bubbles: true, cancelable: true }));
    button.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
    flushSync();
  };

  it("is a switch: role, aria-checked, its label for assistive technology – and a track, no on / off text", () => {
    const { button } = render();
    expect(button.getAttribute("role")).toBe("switch");
    expect(button.getAttribute("aria-checked")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("Snap");
    expect(button.hasAttribute("aria-pressed")).toBe(false);
    expect(button.querySelector(".track")).not.toBeNull();
    expect(button.textContent!.trim()).toBe("");
  });

  it("a click flips it and aria-checked follows", () => {
    const { button, changes } = render();
    button.click();
    flushSync();
    expect(changes).toEqual([true]);
    expect(button.getAttribute("aria-checked")).toBe("true");
    button.click();
    flushSync();
    expect(changes).toEqual([true, false]);
    expect(button.getAttribute("aria-checked")).toBe("false");
  });

  it("Space and Enter flip it once per press; other keys and a held key's repeats do not", () => {
    const { button, changes } = render({ on: true });
    press(button, " ");
    expect(changes).toEqual([false]);
    expect(button.getAttribute("aria-checked")).toBe("false");
    press(button, "Enter");
    expect(changes).toEqual([false, true]);
    press(button, "Enter", true);
    press(button, "Tab");
    press(button, "ArrowRight");
    expect(changes).toEqual([false, true]);
    expect(button.getAttribute("aria-checked")).toBe("true");
  });

  it("cancels the button's own activation, so the browser does not click it a second time", () => {
    const { button } = render();
    const down = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    const up = new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true });
    button.dispatchEvent(down);
    button.dispatchEvent(up);
    expect(down.defaultPrevented).toBe(true);
    expect(up.defaultPrevented).toBe(true);
  });

  it("disabled: the button is disabled and keys do not flip it", () => {
    const { button, changes } = render({ disabled: true });
    expect(button.disabled).toBe(true);
    press(button, " ");
    press(button, "Enter");
    expect(changes).toEqual([]);
    expect(button.getAttribute("aria-checked")).toBe("false");
  });

  it("words show as a quiet value after the track (a variable's false / true), hidden from assistive technology", () => {
    const { button } = render({ words: ["false", "true"] });
    const value = button.querySelector(".value")!;
    expect(value.textContent).toBe("false");
    expect(value.getAttribute("aria-hidden")).toBe("true");
    button.click();
    flushSync();
    expect(value.textContent).toBe("true");
  });
});
