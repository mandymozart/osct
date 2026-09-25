import { afterEach, describe, expect, it, vi } from "vitest";
import "../gold-illustration";

// Penpot-like export: root fill="none", an unfilled frame background, black art, a white cut-out and
// a stroked shape. (Embedded <style> blocks – dropped by the component – break happy-dom's XML parser,
// so they are checked in the browser only.)
const SVG = `<svg width="100" height="50" xmlns="http://www.w3.org/2000/svg" fill="none">
  <g><rect class="background" width="100" height="50"/></g>
  <path class="art" d="M0 0L10 10" style="fill: rgb(0, 0, 0);"/>
  <path class="cutout" d="M1 1L2 2" style="fill: rgb(255, 255, 255);"/>
  <rect class="outline" x="5" y="5" width="10" height="10" style="fill: none; stroke: rgb(0, 0, 0);"/>
</svg>`;

const render = async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(SVG)));
  const el = document.createElement("gold-illustration");
  el.setAttribute("src", `/test-${Math.random()}.svg`);
  document.body.appendChild(el);
  await vi.waitFor(() => expect(el.shadowRoot?.querySelector("svg")).toBeTruthy());
  return el.shadowRoot!;
};

describe("gold-illustration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("paints dark shapes gold, keeps inherited 'none', makes white transparent", async () => {
    const root = await render();
    const art = root.querySelector<SVGElement>("g .art")!; // first copy = chrome layer
    const fill = (selector: string) => root.querySelector(`g ${selector}`)!.getAttribute("fill");

    expect(fill(".background")).toBe("none"); // root fill="none" is inherited, not the SVG default
    expect(art.getAttribute("fill")).toMatch(/^url\(#gold-\d+-chrome\)$/);
    expect(art.style.getPropertyValue("fill")).toBe("");
    expect(fill(".cutout")).toBe("none");
    expect(fill(".outline")).toBe("none");
    expect(root.querySelector("g .outline")!.getAttribute("stroke")).toMatch(/chrome/);
  });

  it("adds a highlight copy with the sweep gradient", async () => {
    const root = await render();
    const layers = root.querySelectorAll("svg > g");
    expect(layers).toHaveLength(2);
    expect(layers[1].querySelector(".art")!.getAttribute("fill")).toMatch(/sweep/);
    expect(root.querySelector("linearGradient[id$='-sweep']")).toBeTruthy();
  });
});
