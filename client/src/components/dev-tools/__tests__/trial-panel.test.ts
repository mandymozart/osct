import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { numberedRows, TRIAL_MODEL_KEY, TRIAL_TESTER_KEY, TRIAL_WINDOW, type TrialPanel } from "../trial-panel";
import type { TrialRow } from "../trial-report";

const row = (targetId: string, printed: boolean | undefined): TrialRow => ({
  targetId, entryId: targetId, title: targetId, category: "glossary", page: Number(targetId.slice(1, 4)),
  spreadId: "s", spreadTitle: "s", imageSrc: "", result: "untested",
  ...(printed === undefined ? {} : { info: printed ? { width: 30, height: 20 } : { note: "not on the test printout" } }),
});

describe("trial strip", () => {
  it("orders by page, then the number on the page, and numbers only the printed targets", () => {
    const rows = [row("p038-2", true), row("p004-1", true), row("p030-2", false), row("p038-1", true), row("p030-1", true)];
    expect(numberedRows(rows).map(r => [r.targetId, r.number])).toEqual([
      ["p004-1", 1], ["p030-1", 2], ["p030-2", null], ["p038-1", 3], ["p038-2", 4],
    ]);
  });

  it("without printed-image details every target gets a number", () => {
    expect(numberedRows([row("p010-1", undefined), row("p002-1", undefined)]).map(r => r.number)).toEqual([1, 2]);
  });

  it("holds the neighbouring spreads while the trial is open", () => {
    expect(TRIAL_WINDOW).toBe(1);
  });
});

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1";

/** Overrides a read-only browser property for one test; afterEach puts the original back */
const overrides: Array<() => void> = [];
const override = (target: object, key: string, value: unknown) => {
  const own = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, get: () => value });
  overrides.push(() => {
    if (own) Object.defineProperty(target, key, own);
    else delete (target as Record<string, unknown>)[key];
  });
};

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

const mount = async () => {
  const panel = document.createElement("trial-panel") as TrialPanel;
  document.body.appendChild(panel);
  await settle();
  const root = panel.shadowRoot!;
  return {
    panel,
    model: root.querySelector<HTMLInputElement>('input[name="model"]')!,
    tester: root.querySelector<HTMLInputElement>('input[name="tester"]')!,
    pick: root.querySelector<HTMLSelectElement>('select[name="pick"]')!,
    hint: root.querySelector<HTMLElement>(".device .hint")!,
    md: () => root.querySelector<HTMLButtonElement>('[data-action="download"]')!,
  };
};

const type = (field: HTMLInputElement, value: string) => {
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
};

describe("trial strip: the phone model", () => {
  let created: Blob[] = [];

  beforeEach(() => {
    localStorage.clear();
    created = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    vi.spyOn(URL, "createObjectURL").mockImplementation(blob => {
      created.push(blob as Blob);
      return "blob:report";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.replaceChildren();
    overrides.splice(0).reverse().forEach(restore => restore());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("exports the report only once the model is filled in, and remembers it on the device", async () => {
    const { model, md, hint, panel } = await mount();
    expect(panel.canExport()).toBe(false);
    expect(md().classList.contains("off")).toBe(true);
    expect(md().getAttribute("aria-disabled")).toBe("true");
    expect(hint.textContent).toContain("the phone model is needed for md");

    md().click();
    expect(created).toEqual([]);
    expect(panel.shadowRoot!.activeElement).toBe(model);

    type(model, "iPhone 12 mini");
    expect(localStorage.getItem(TRIAL_MODEL_KEY)).toBe("iPhone 12 mini");
    expect(md().classList.contains("off")).toBe(false);
    md().click();
    expect(created).toHaveLength(1);
    expect(await created[0].text()).toContain("- Device: iPhone 12 mini (tester) · ");

    type(model, "  ");
    expect(panel.canExport()).toBe(false);
    expect(localStorage.getItem(TRIAL_MODEL_KEY)).toBeNull();
  });

  it("keeps the model and the initials across openings and puts the initials into the report", async () => {
    localStorage.setItem(TRIAL_MODEL_KEY, "Pixel 8");
    const first = await mount();
    expect(first.model.value).toBe("Pixel 8");
    type(first.tester, "VB");
    expect(localStorage.getItem(TRIAL_TESTER_KEY)).toBe("VB");
    first.panel.remove();

    const again = await mount();
    expect(again.tester.value).toBe("VB");
    expect(again.panel.report()).toContain("- Tester: VB");
    expect(again.panel.report()).toContain(`- Language: ${navigator.language}`);
  });

  it("keeps the model field and what is typed while the strip redraws", async () => {
    const { model, panel } = await mount();
    type(model, "Galaxy S2");
    const internals = panel as unknown as { signature: string; render(): void };
    internals.signature = "";
    internals.render();
    expect(panel.shadowRoot!.querySelector<HTMLInputElement>('input[name="model"]')).toBe(model);
    expect(model.value).toBe("Galaxy S2");
  });

  it("prefills the model from Chromium's client hints, with the code and the real Android version", async () => {
    override(navigator, "userAgentData", {
      platform: "Android",
      getHighEntropyValues: async () => ({ platform: "Android", model: "SM-S901B", platformVersion: "14.0.0" }),
    });
    const { model, md, panel } = await mount();
    expect(model.value).toBe("Galaxy S22 (SM-S901B)");
    expect(md().classList.contains("off")).toBe(false);
    const report = panel.report();
    expect(report).toContain("- Device: Galaxy S22 (SM-S901B) (tester) · from the browser: SM-S901B");
    expect(report).toContain("- OS: Android 14.0.0 (from the browser)");
  });

  it("never overwrites what the tester entered with the browser's model", async () => {
    localStorage.setItem(TRIAL_MODEL_KEY, "Galaxy S22 Ultra");
    override(navigator, "userAgentData", { getHighEntropyValues: async () => ({ model: "SM-S901B", platformVersion: "14.0.0" }) });
    const { model } = await mount();
    expect(model.value).toBe("Galaxy S22 Ultra");
  });

  it("narrows an iPhone's pick list by the screen and says it is a guess", async () => {
    override(navigator, "userAgent", IPHONE_UA);
    override(screen, "width", 375);
    override(screen, "height", 812);
    override(window, "devicePixelRatio", 3);
    const { model, pick, hint, panel } = await mount();
    expect(model.value).toBe("");
    const guess = pick.querySelector("optgroup")!;
    expect(guess.label).toBe("Screen-size guess");
    expect(Array.from(guess.querySelectorAll("option"), o => o.value)).toEqual(["iPhone 12 mini", "iPhone 13 mini", "iPhone X", "iPhone XS", "iPhone 11 Pro"]);
    expect(hint.textContent).toContain("a guess from the screen size (375×812 @3)");

    pick.value = "iPhone 13 mini";
    pick.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    expect(model.value).toBe("iPhone 13 mini");
    expect(pick.value).toBe("");
    expect(localStorage.getItem(TRIAL_MODEL_KEY)).toBe("iPhone 13 mini");
    const report = panel.report();
    expect(report).toContain("- Device: iPhone 13 mini (tester) · screen-size guess: iPhone 12 mini / 13 mini / X / XS / 11 Pro");
    expect(report).toContain("- Screen: 375×812 @3");
    expect(report).toContain("- OS: iOS 18.7 as Safari reports it – frozen");
  });
});
