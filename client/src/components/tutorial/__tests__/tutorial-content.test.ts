import { describe, expect, it } from "vitest";
import { fillBookFields } from "../tutorial-content";
import { getBook } from "@/utils/game-config";
import { ONBOARDING_ICON_SRC } from "@/utils/static-splash-html";

describe("tutorial content", () => {
  it("fills book fields into step texts", () => {
    const book = { title: "Onion Skin", author: "Kévin Bray", publisher: "Building Fictions" };
    expect(fillBookFields("{{publisher}}", book)).toBe("Building Fictions");
    expect(fillBookFields("{{title}} by {{author}}", book)).toBe("Onion Skin by Kévin Bray");
    expect(fillBookFields("{{other}}", book)).toBe("{{other}}");
    expect(fillBookFields("{{publisher}}", { title: "T", author: "A" })).toBe("");
  });

  it("uses book.yaml by default", () => {
    expect(fillBookFields("{{publisher}}")).toBe(getBook().publisher);
  });
});

describe("tutorial content on the vertical grid (#295) with the shimmering title (#280)", () => {
  const render = (step: number) => {
    const content = document.createElement("tutorial-content");
    content.setAttribute("current-step", String(step));
    document.body.appendChild(content);
    const root = content.shadowRoot!;
    content.remove();
    return root;
  };

  it("puts the icon in row 1 and the illustration in row 2, then the text block", () => {
    const root = render(1);
    const parts = Array.from(root.children).filter(el => el.tagName !== "STYLE").map(el => el.className || el.tagName);
    expect(parts.slice(0, 3)).toEqual(["row icon-row", "row illustration-row", "head"]);
    expect(root.querySelector(".icon-row img[data-icon]")?.getAttribute("src")).toBe(ONBOARDING_ICON_SRC);
    expect(root.querySelector(".illustration-row gold-illustration")).not.toBeNull();
  });

  it("keeps row 2 when a step has no illustration, so the text still starts at row 3", () => {
    expect(render(0).querySelector(".illustration-row")?.children.length).toBe(0);
  });

  it("shimmers the book title on the splash only", () => {
    expect(render(0).querySelector("h1")?.classList.contains("shimmer")).toBe(true);
    expect(render(4).querySelector("h1")?.classList.contains("shimmer")).toBe(false);
  });
});

describe("tutorial content fades (#281)", () => {
  const render = (step: number) => {
    const content = document.createElement("tutorial-content");
    content.setAttribute("current-step", String(step));
    document.body.appendChild(content);
    content.remove();
    return content;
  };

  it("splash: icon and title at once, author and publisher fade in together after 1 s, over 1 s", () => {
    const content = render(0);
    const root = content.shadowRoot!;
    expect(root.querySelector("img[data-icon]")?.classList.contains("fade")).toBe(false);
    expect(root.querySelector("h1")?.classList.contains("fade")).toBe(false);
    const fading = Array.from(root.querySelectorAll<HTMLElement>(".fade"));
    expect(fading.map(el => el.classList.contains("footer") ? "footer" : "text")).toEqual(["text", "footer"]);
    expect(fading.every(el => el.style.animationDelay === "1000ms")).toBe(true);
    expect(content.style.getPropertyValue("--fade-duration")).toBe("1000ms");
  });

  it("onboarding steps show at once, with nothing fading", () => {
    for (const step of [1, 2, 3, 4]) {
      const content = render(step);
      expect(content.shadowRoot!.querySelectorAll(".fade").length, `step ${step}`).toBe(0);
      expect(content.style.getPropertyValue("--fade-duration")).toBe("0ms");
    }
  });

  it("drops the camera illustration; the intro keeps its drawing", () => {
    expect(render(1).shadowRoot!.querySelector("gold-illustration")).not.toBeNull();
    expect(render(3).shadowRoot!.querySelector("gold-illustration")).toBeNull();
  });
});
