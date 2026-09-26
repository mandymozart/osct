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
