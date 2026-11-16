import { describe, expect, it } from "vitest";
import { fillBookFields } from "../tutorial-content";
import { getBook } from "@/utils/game-config";

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

  it("puts the Mark in row 1 and the illustration in row 2, then the text block", () => {
    const root = render(1);
    const parts = Array.from(root.children).filter(el => el.tagName !== "STYLE").map(el => el.className || el.tagName);
    expect(parts.slice(0, 3)).toEqual(["row mark-row", "row illustration-row", "head"]);
    expect(root.querySelector(".mark-row img[data-mark]")).not.toBeNull();
    expect(root.querySelector(".illustration-row gold-illustration")).not.toBeNull();
  });

  it("keeps row 2 when a step has no illustration, so the text still starts at row 3", () => {
    expect(render(0).querySelector(".illustration-row")?.children.length).toBe(0);
  });

  it("shimmers the book title on the splash only", () => {
    expect(render(0).querySelector("h1")?.classList.contains("shimmer")).toBe(true);
    expect(render(3).querySelector("h1")?.classList.contains("shimmer")).toBe(false);
  });
});
