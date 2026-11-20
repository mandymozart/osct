import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { describeDelivery, registerDeliveryTools } from "../src/deliveries.ts";
import { fakeFetch, recorder, type Seen } from "./helpers.ts";
import type { DeliveryResult } from "../../shared/api/deliveries";

const LINKS = { editor: "http://localhost:5175/editor" };

const PLAN = {
  name: "2026-11-final",
  source: "delivery folder",
  scenes: [{ id: "s186-187", label: "186–187", preset: "double" }],
  entries: [
    { id: "p186-1", scene: "s186-187", category: "video", title: "Placeholder", image: "a1", target: { imageSrc: "/a/t.webp", video: "/a/v.mp4" } },
    { id: "racoon", scene: "s1", category: "glossary", title: "Racoon", image: "/a/r2.webp", target: { imageSrc: "/a/r.webp" } },
  ],
};

const comparison = (overrides: Partial<DeliveryResult> = {}): DeliveryResult => ({
  delivery: { id: null, name: "2026-11-final", source: "delivery folder" },
  applied: false,
  items: [
    { kind: "scene", id: "s186-187", status: "new" },
    { kind: "entry", id: "p186-1", scene: "s186-187", status: "new" },
    { kind: "target", id: "p186-1", entry: "p186-1", status: "new" },
    { kind: "entry", id: "racoon", scene: "s1", status: "changed", fields: ["image"] },
    { kind: "target", id: "racoon", entry: "racoon", status: "conflict", fields: ["imageSrc"], reason: "imageSrc was edited in the editor since the last delivery" },
  ],
  counts: { new: 3, changed: 1, same: 0, conflict: 1 },
  problems: [],
  warnings: ["entry racoon lies on scene s1, the delivery says s1 – kept"],
  written: [],
  ...overrides,
});

describe("delivery tools (#322 T8)", () => {
  let seen: Seen[];
  let rec: ReturnType<typeof recorder>;
  /** what the fake draft answers: changes between calls make another comparison */
  let draft: DeliveryResult;

  beforeEach(() => {
    draft = comparison();
    const fake = fakeFetch(({ method, path, body }) => {
      if (method === "POST" && path === "/editor/experiences/osct/deliveries") {
        const b = body as { apply?: boolean; overwrite?: boolean };
        if (b.apply) return { json: { ...draft, applied: true, delivery: { ...draft.delivery, id: "d-1" }, written: ["c1", "c2", "c3", "c4"] } };
        return { json: draft };
      }
      if (method === "GET" && path.startsWith("/editor/experiences/osct/deliveries")) {
        return { json: { deliveries: [{ id: "d-1", name: "2026-11-final", source: "delivery folder", counts: { new: 3, changed: 1, same: 0, conflict: 1 }, user: "a@b.c", token: "claude", createdAt: "2026-11-20T10:00:00Z", changes: 4 }] } };
      }
      return undefined;
    });
    seen = fake.seen;
    rec = recorder();
    registerDeliveryTools(rec.server, fake.api(), LINKS);
  });

  it("registers preview_delivery, import_delivery and list_deliveries", () => {
    expect([...rec.tools.keys()].sort()).toEqual(["import_delivery", "list_deliveries", "preview_delivery"]);
    expect(rec.tools.get("preview_delivery")?.config.annotations).toMatchObject({ readOnlyHint: true });
    expect(rec.tools.get("import_delivery")?.config.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("preview_delivery: the comparison for the person, nothing written", async () => {
    const result = await rec.call("preview_delivery", { experience: "osct", plan: PLAN });
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "POST", path: "/editor/experiences/osct/deliveries", body: PLAN });
    expect((seen[0].body as Record<string, unknown>).apply).toBeUndefined();
    expect(result.data).toMatchObject({ applied: false, counts: { new: 3, changed: 1, conflict: 1 }, confirmation: { id: expect.stringMatching(/^[0-9a-f]{32}$/) }, open: "http://localhost:5175/editor/osct/" });
    expect(result.data.summary).toContain("Delivery “2026-11-final” into osct – nothing written yet: 3 new, 1 changed, 0 same, 1 conflict.");
    expect(result.data.summary).toContain("- entry racoon (scene s1) – image");
    expect(result.data.summary).toContain("- target racoon – imageSrc – imageSrc was edited in the editor since the last delivery");
    expect(result.data.summary).toContain("left as they are unless overwrite");
    expect(result.data.summary).toContain("Warnings:");
    expect(result.data.next).toContain("import_delivery");
    expect(result.data.next).toContain("overwrite: true");
  });

  it("preview_delivery: overwrite is sent, the same rows are only counted, problems give no confirmation", async () => {
    draft = comparison({ items: [...comparison().items, { kind: "entry", id: "castle", status: "same" }], counts: { new: 3, changed: 1, same: 1, conflict: 1 }, problems: ["entries.p186-1.image: a1 is no file of the Library"] });
    const result = await rec.call("preview_delivery", { experience: "osct", plan: PLAN, overwrite: true });
    expect((seen[0].body as Record<string, unknown>).overwrite).toBe(true);
    expect(result.data.items.map((i: { id: string }) => i.id)).not.toContain("castle");
    expect(result.data.confirmation).toBeNull();
    expect(result.data.summary).toContain("Problems – nothing can be written until they are fixed:\n- entries.p186-1.image: a1 is no file of the Library");
    expect(result.data.summary).toContain("(overwritten)");
    expect(result.data.next).toContain("nothing can be");
  });

  it("the plan as a JSON file; plan and file both or neither, a wrong plan refused before it is sent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "osct-delivery-"));
    const file = join(dir, "plan.json");
    writeFileSync(file, JSON.stringify({ ...PLAN, apply: true, overwrite: true }));
    const result = await rec.call("preview_delivery", { experience: "osct", file });
    expect(result.ok).toBe(true);
    expect(seen[0].body).toEqual(PLAN);
    expect((await rec.call("preview_delivery", { experience: "osct" })).ok).toBe(false);
    expect((await rec.call("preview_delivery", { experience: "osct", plan: PLAN, file })).ok).toBe(false);
    const wrong = join(dir, "wrong.json");
    writeFileSync(wrong, JSON.stringify({ name: "x", entries: [{ id: "e", scene: "s1", category: "nope", title: "E", note: "n" }] }));
    const refused = await rec.call("preview_delivery", { experience: "osct", file: wrong });
    expect(refused.ok).toBe(false);
    expect(refused.data.error.code).toBe("invalid-plan");
    expect(refused.data.error.message).toContain("category");
    expect((await rec.call("preview_delivery", { experience: "osct", file: join(dir, "missing.json") })).data.error.code).toBe("invalid-plan");
    expect(seen).toHaveLength(1);
    await expect(rec.call("preview_delivery", { experience: "osct", plan: { ...PLAN, extra: 1 } })).rejects.toThrow();
  });

  it("import_delivery: first the comparison and a confirmation, nothing written; then with confirm it is written", async () => {
    const first = await rec.call("import_delivery", { experience: "osct", plan: PLAN });
    expect(first.ok).toBe(true);
    expect(first.data).toMatchObject({ applied: false, confirmation: { id: expect.any(String) } });
    expect(first.data.void).toBeUndefined();
    expect(seen.every(s => !(s.body as { apply?: boolean }).apply)).toBe(true);
    const preview = await rec.call("preview_delivery", { experience: "osct", plan: PLAN });
    expect(preview.data.confirmation.id).toBe(first.data.confirmation.id);

    const done = await rec.call("import_delivery", { experience: "osct", plan: PLAN, confirm: first.data.confirmation.id });
    expect(done.ok).toBe(true);
    const applied = seen.at(-1);
    expect(applied?.body).toEqual({ ...PLAN, apply: true });
    expect(seen.at(-2)?.body).toEqual(PLAN);
    expect(done.data).toMatchObject({ applied: true, delivery: { id: "d-1" }, written: ["c1", "c2", "c3", "c4"], open: "http://localhost:5175/editor/osct/" });
    expect(done.data.confirmation).toBeUndefined();
    expect(done.data.summary).toContain("– written:");
    expect(done.data.summary).toContain("4 changes written (delivery d-1)");
  });

  it("import_delivery: a comparison changed since (or another overwrite) voids the confirmation – nothing written", async () => {
    const first = await rec.call("import_delivery", { experience: "osct", plan: PLAN });
    draft = comparison({ items: comparison().items.slice(0, 3), counts: { new: 3, changed: 0, same: 0, conflict: 0 } });
    const stale = await rec.call("import_delivery", { experience: "osct", plan: PLAN, confirm: first.data.confirmation.id });
    expect(stale.data).toMatchObject({ applied: false, void: expect.stringContaining("no longer fits"), counts: { conflict: 0 } });
    expect(stale.data.confirmation.id).not.toBe(first.data.confirmation.id);
    const other = await rec.call("import_delivery", { experience: "osct", plan: PLAN, overwrite: true, confirm: stale.data.confirmation.id });
    expect(other.data.void).toBeDefined();
    expect(seen.some(s => (s.body as { apply?: boolean }).apply)).toBe(false);
  });

  it("import_delivery: a problem the server meets on apply comes back as the comparison", async () => {
    const fake = fakeFetch(({ body }) =>
      (body as { apply?: boolean }).apply
        ? { status: 409, json: { error: { code: "delivery-problems", message: "The delivery has problems – nothing was written.", comparison: comparison({ problems: ["too many targets"] }) } } }
        : { json: comparison() },
    );
    const r = recorder();
    registerDeliveryTools(r.server, fake.api(), LINKS);
    const first = await r.call("import_delivery", { experience: "osct", plan: PLAN });
    const second = await r.call("import_delivery", { experience: "osct", plan: PLAN, confirm: first.data.confirmation.id });
    expect(second.ok).toBe(true);
    expect(second.data).toMatchObject({ applied: false, problems: ["too many targets"], confirmation: null, void: expect.stringContaining("problems") });
  });

  it("list_deliveries: newest first from the API, with the limit", async () => {
    const result = await rec.call("list_deliveries", { experience: "osct", limit: 5 });
    expect(seen[0]).toMatchObject({ method: "GET", path: "/editor/experiences/osct/deliveries?limit=5" });
    expect(result.data).toMatchObject({ deliveries: [{ id: "d-1", changes: 4 }], open: "http://localhost:5175/editor/osct/" });
    await rec.call("list_deliveries", { experience: "osct" });
    expect(seen[1].path).toBe("/editor/experiences/osct/deliveries");
  });

  it("describeDelivery: a long list is cut per status", () => {
    const items = Array.from({ length: 45 }, (_, n) => ({ kind: "entry" as const, id: `e${n}`, status: "new" as const }));
    const summary = describeDelivery("osct", comparison({ items, counts: { new: 45, changed: 0, same: 0, conflict: 0 }, warnings: [] }), false);
    expect(summary).toContain("- … and 5 more");
    expect(summary).not.toContain("Warnings");
  });
});
