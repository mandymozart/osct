import { describe, expect, it } from "vitest";
import "..";
import { PUBLISHER } from "../privacy-page";

/** Privacy & terms (#353): who is responsible, the privacy notice and the terms under Dutch law */
describe("privacy page", () => {
  it("names Building Fictions with its address, KvK number and a mail link, and has every section", () => {
    const page = document.body.appendChild(document.createElement("privacy-page"));
    const root = page.shadowRoot!;
    const text = root.querySelector(".content")?.textContent ?? "";
    expect(text).toContain(`${PUBLISHER.name}, ${PUBLISHER.address} · KvK ${PUBLISHER.kvk}`);
    expect(root.querySelector<HTMLAnchorElement>(`a[href="mailto:${PUBLISHER.email}"]`)).not.toBeNull();
    expect(Array.from(root.querySelectorAll("h2")).map(h => h.textContent)).toEqual(["Who we are", "Privacy", "Terms of use", "Applicable law"]);
    expect(text).toContain("Autoriteit Persoonsgegevens");
    expect(text).toContain("YouTube or Vimeo");
    expect(text).toContain("Last changed: 23 November 2026");
    expect(text).not.toMatch(/\{\{|\[/);
  });
});
