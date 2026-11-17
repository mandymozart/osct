import { describe, expect, it } from "vitest";
import { t } from "i18next";
import { spreadLabel } from "../credits-page";

/** The image credits page groups its lines by spread – under the label the reader finds in the book (#292, #307) */
describe("credits page spread label", () => {
  const surfaces = [
    { id: "l", side: "left", widthMm: 170, heightMm: 240, label: "40" },
    { id: "r", side: "right", widthMm: 170, heightMm: 240, label: "41" },
  ];

  it("pages as before without scene labels", () => {
    expect(spreadLabel({ title: "", firstPage: 2, lastPage: 3 })).toBe(t("about:pages", { first: 2, last: 3 }));
    expect(spreadLabel({ title: "Cover", format: "cover", firstPage: 0, lastPage: 0 })).toBe("Cover");
  });

  it("a scene's own label, else its surfaces' printed labels (schema 2.35)", () => {
    expect(spreadLabel({ title: "", firstPage: 6, lastPage: 7, surfaces })).toBe(t("about:pages", { first: "40", last: "41" }));
    expect(spreadLabel({ title: "", firstPage: 6, lastPage: 7, surfaces: [surfaces[0]] })).toBe(t("about:page", { page: "40" }));
    expect(spreadLabel({ title: "", firstPage: 6, lastPage: 7, surfaces, label: "Preface" })).toBe("Preface");
  });
});
