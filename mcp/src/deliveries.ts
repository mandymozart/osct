// A publisher's delivery over the API (`/api/editor/experiences/{id}/deliveries`, docs/server.md "Deliveries", #322 T8):
// the plan – the scenes its entries need, the entries with their targets, the Library files they name by id or URL – is
// compared with the draft, shown to the person, and written only with their yes. Two steps as import_experience: the
// server keeps no confirmation for a delivery, so this file makes one – a digest of the plan and of the comparison the
// person saw; import_delivery compares again and writes only when the comparison is still the same. The MCP never
// converts or uploads media: the files are uploaded before (upload_asset, or the CLI).
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { ApiError, type OsctApi } from "./api.ts";
import { fail, guard, text } from "./result.ts";
import { editorHref, type AppLinks } from "./services.ts";
import type { SurfaceData } from "../../shared/types/game-config";
import { EntryCategory } from "../../shared/types/entry";
import type { DeliveryEntry, DeliveryItem, DeliveryList, DeliveryPlan, DeliveryResult, DeliveryStatus } from "../../shared/api/deliveries";
import { SCENE_PRESETS } from "../../shared/api/editor";
import { ID_PATTERN, TEXT_MAX_LENGTH } from "../../shared/api/rules";

const ID = z.string().regex(ID_PATTERN, "letters, digits, _ and -, at most 64");
const EXPERIENCE = ID.describe("the experience's id (list_experiences)");
/** A Library file by the asset's id or its URL (list_assets, upload_asset) */
const FILE = z.string().min(1).max(2048);

/** `DeliveryPlan` without `apply` and `overwrite` – the tools set those */
export const planSchema = z
  .object({
    name: z.string().trim().min(1).max(200).describe("the delivery's name, e.g. its folder's (2026-11-final)"),
    source: z.string().max(500).optional().describe("where it came from – information for the record"),
    scenes: z
      .array(
        z
          .object({
            id: ID,
            label: z.string().max(TEXT_MAX_LENGTH).optional().describe("default: the id"),
            preset: z.enum(SCENE_PRESETS).optional().describe("the new scene's surfaces (default double)"),
            surfaces: z.array(z.record(z.string(), z.unknown())).optional().describe("instead of preset: put_scene's surfaces { id, label?, widthMm, heightMm, place? }"),
          })
          .strict(),
      )
      .optional()
      .describe("the scenes the entries need, in the book's order: one that exists is kept as it is, a new one goes after the plan's scene before it"),
    entries: z
      .array(
        z
          .object({
            id: ID,
            scene: ID.describe("a scene of the experience or of the plan's scenes"),
            surface: ID.optional(),
            category: z.enum(EntryCategory),
            title: z.string().min(1).max(TEXT_MAX_LENGTH),
            author: z.string().optional(),
            body: z.string().optional(),
            caption: z.string().optional(),
            media: z.string().optional(),
            tags: z.array(z.string()).optional(),
            image: FILE.optional().describe("the entry's picture"),
            target: z
              .object({
                imageSrc: FILE.describe("the printed image"),
                enabled: z.boolean().optional().describe("false switches a new target off; an existing one keeps its switch"),
                video: FILE.optional().describe("the video on the target"),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .describe("a new entry gets these texts; an existing one keeps its texts, category and scene – only its image and its target's image and video follow the delivery"),
  })
  .strict();

// the schema stays the shared contract's shape (a field added to DeliveryPlan fails here)
type PlanInput = z.infer<typeof planSchema>;
type SharedPlan = Omit<DeliveryPlan, "apply" | "overwrite">;
const asShared = (plan: PlanInput): SharedPlan => ({ ...plan, scenes: plan.scenes?.map(s => ({ ...s, surfaces: s.surfaces as SurfaceData[] | undefined })) });
export const PLAN_FIELDS = { name: true, source: true, scenes: true, entries: true } satisfies Record<keyof SharedPlan, true> & Record<keyof PlanInput, true>;
export const ENTRY_FIELDS = {
  id: true, scene: true, surface: true, category: true, title: true, author: true, body: true, caption: true, media: true, tags: true, image: true, target: true,
} satisfies Record<keyof DeliveryEntry, true> & Record<keyof PlanInput["entries"][number], true>;

/** The plan from the arguments: inline, or a JSON file on this computer (the CLI's plan); its own apply / overwrite are dropped */
export async function readPlan({ plan, file }: { plan?: PlanInput; file?: string }): Promise<SharedPlan | { error: { code: string; message: string } }> {
  if (!plan === !file) return { error: { code: "mcp", message: "give either plan or file (a JSON delivery plan on this computer)" } };
  if (plan) return asShared(plan);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file as string, "utf8"));
  } catch (error) {
    return { error: { code: "invalid-plan", message: `${file} is not a readable JSON file: ${error instanceof Error ? error.message : String(error)}` } };
  }
  if (raw && typeof raw === "object") {
    const { apply: _apply, overwrite: _overwrite, ...rest } = raw as Record<string, unknown>;
    raw = rest;
  }
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) return { error: { code: "invalid-plan", message: `${file} is no delivery plan:\n${z.prettifyError(parsed.error)}` } };
  return asShared(parsed.data);
}

/** The confirmation: the plan, overwrite and the comparison the person saw – another comparison is another id */
export function confirmationOf(experience: string, plan: SharedPlan, overwrite: boolean, result: DeliveryResult): string {
  const seen = { experience, plan, overwrite, items: result.items, problems: result.problems };
  return createHash("sha256").update(JSON.stringify(seen)).digest("hex").slice(0, 32);
}

const LISTED_PER_STATUS = 40;

const itemLine = (item: DeliveryItem): string => {
  const where = item.kind === "entry" && item.scene ? ` (scene ${item.scene})` : item.kind === "target" && item.entry && item.entry !== item.id ? ` (entry ${item.entry})` : "";
  const fields = item.fields?.length ? ` – ${item.fields.join(", ")}` : "";
  const reason = item.reason ? ` – ${item.reason}` : "";
  return `${item.kind} ${item.id}${where}${fields}${reason}`;
};

const HEADINGS: Record<Exclude<DeliveryStatus, "same">, string> = {
  new: "New",
  changed: "Changed (the fields that follow the delivery)",
  conflict: "Conflicts – edited in the editor since the last delivery",
};

/** The comparison as a person reads it: the counts, what is new, changed, in conflict, the problems and the warnings */
export function describeDelivery(experience: string, result: DeliveryResult, overwrite: boolean): string {
  const { counts } = result;
  const lines = [
    `Delivery “${result.delivery.name}” into ${experience}${result.applied ? " – written" : " – nothing written yet"}: ${counts.new} new, ${counts.changed} changed, ${counts.same} same, ${counts.conflict} conflict${counts.conflict === 1 ? "" : "s"}.`,
  ];
  for (const status of ["new", "changed", "conflict"] as const) {
    const items = result.items.filter(i => i.status === status);
    if (!items.length) continue;
    const heading = status === "conflict" ? `${HEADINGS.conflict} (${overwrite ? "overwritten" : "left as they are unless overwrite"})` : HEADINGS[status];
    lines.push("", `${heading}:`, ...items.slice(0, LISTED_PER_STATUS).map(i => `- ${itemLine(i)}`));
    if (items.length > LISTED_PER_STATUS) lines.push(`- … and ${items.length - LISTED_PER_STATUS} more`);
  }
  if (result.problems.length) lines.push("", "Problems – nothing can be written until they are fixed:", ...result.problems.map(p => `- ${p}`));
  if (result.warnings.length) lines.push("", "Warnings:", ...result.warnings.map(w => `- ${w}`));
  if (result.applied) lines.push("", `${result.written.length} change${result.written.length === 1 ? "" : "s"} written (delivery ${result.delivery.id}) – revertable with revert_change / the editor's history.`);
  return lines.join("\n");
}

export function registerDeliveryTools(server: McpServer, api: OsctApi, links: AppLinks): void {
  const path = (experience: string) => `/editor/experiences/${encodeURIComponent(experience)}/deliveries`;
  const compare = (experience: string, plan: SharedPlan, overwrite: boolean) =>
    api.call<DeliveryResult>("POST", path(experience), { ...plan, ...(overwrite ? { overwrite } : {}) });

  /** A comparison as the tools answer it: the summary first, the rows that are not `same`, the confirmation (none with problems) */
  const shown = (experience: string, plan: SharedPlan, overwrite: boolean, result: DeliveryResult) => ({
    applied: result.applied,
    delivery: result.delivery,
    summary: describeDelivery(experience, result, overwrite),
    counts: result.counts,
    items: result.items.filter(i => i.status !== "same"),
    problems: result.problems,
    warnings: result.warnings,
    confirmation: result.problems.length ? null : { id: confirmationOf(experience, plan, overwrite, result) },
    open: editorHref(links, experience),
  });

  const next = (problems: boolean, conflicts: number, overwrite: boolean) =>
    problems
      ? "Nothing was written, and nothing can be: show the person the summary with its problems – a missing file is uploaded first (upload_asset), a scene added to the plan – then compare again."
      : `Nothing was written. Show the person the summary and ask. Only with their yes call import_delivery with the same experience, plan${overwrite ? ", overwrite" : ""} and confirm: confirmation.id – a change meanwhile voids it.${conflicts && !overwrite ? " The conflicts stay as they are; overwrite: true writes them too – only if the person asks for it (it answers a new comparison to confirm)." : ""}`;

  const planInput = {
    experience: EXPERIENCE,
    plan: planSchema.optional().describe("the delivery plan (shared/api/deliveries.ts DeliveryPlan): name, source?, scenes?, entries – files are Library files by the asset's id or URL, uploaded before"),
    file: z.string().optional().describe("instead of plan: the path of a JSON delivery plan on this computer (as the CLI writes it); its own apply / overwrite are ignored"),
    overwrite: z.boolean().optional().describe("write the conflicts too – only when the person asked for it"),
  };

  server.registerTool(
    "preview_delivery",
    {
      description:
        "What a publisher's delivery would do to the experience's draft – read-only, nothing is written. Takes the delivery plan (inline `plan` or a JSON `file`): the scenes its entries need, the entries with their targets, the Library files they name by the asset's id or URL (upload them first with upload_asset; this tool never uploads or converts). Answers `summary` – the comparison for the person: per scene, entry and target new / changed (the fields: image, imageSrc, video) / same / conflict (edited in the editor since the last delivery – left as it is unless overwrite), the problems that stop it (an unknown scene or file, a target id in use, more than 10 targets on a scene) and the warnings – with `counts`, the `items` that are not same and a `confirmation`. Show the summary to the person; only with their yes call import_delivery with the same plan and `confirm: confirmation.id`.",
      inputSchema: z.object(planInput),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ experience, plan, file, overwrite = false }) => {
      const read = await readPlan({ plan, file });
      if ("error" in read) return fail(read);
      const result = await compare(experience, read, overwrite);
      return text({ ...shown(experience, read, overwrite, result), next: next(result.problems.length > 0, result.counts.conflict, overwrite) });
    }),
  );

  server.registerTool(
    "import_delivery",
    {
      description:
        "Writes a publisher's delivery into the experience's draft – **two steps**, as import_experience: without `confirm` it writes nothing and answers the comparison (preview_delivery's `summary`, `counts`, `items`, `problems`, `warnings`) and a `confirmation`. Show the summary to the person and ask; only with their yes call again with the same experience, plan (or file), overwrite and `confirm: confirmation.id`. The comparison is made again then: when anything changed meanwhile (the draft, the plan) nothing is written and the new comparison comes back (`void`) to show again. Written in one transaction: new scenes, entries and targets; an existing entry keeps its texts, category and scene – only its picture and its target's image and video follow the delivery; conflicts stay as they are unless `overwrite: true` (only when the person asked). Each write is a change naming the delivery – the editor's history (revert_change) takes it back. A plan with problems is never written.",
      inputSchema: z.object({ ...planInput, confirm: z.string().optional().describe("the second step: the confirmation id of the comparison the person agreed to") }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ experience, plan, file, overwrite = false, confirm }) => {
      const read = await readPlan({ plan, file });
      if ("error" in read) return fail(read);
      const comparison = await compare(experience, read, overwrite);
      const current = shown(experience, read, overwrite, comparison);
      if (!confirm || current.confirmation?.id !== confirm) {
        return text({
          ...current,
          ...(confirm ? { void: "The confirmation no longer fits – the draft or the plan changed since the person saw the comparison. Show them this one and ask again." } : {}),
          next: next(comparison.problems.length > 0, comparison.counts.conflict, overwrite),
        });
      }
      try {
        const result = await api.call<DeliveryResult>("POST", path(experience), { ...read, apply: true, ...(overwrite ? { overwrite } : {}) });
        const answer = shown(experience, read, overwrite, result);
        return text({ ...answer, confirmation: undefined, written: result.written, next: "Give the person the link to check the draft on the stage; list_deliveries names the delivery, list_changes its changes." });
      } catch (error) {
        // a problem that came up between the two calls: the server's comparison, nothing written
        if (error instanceof ApiError && error.code === "delivery-problems" && error.details.comparison) {
          const result = error.details.comparison as DeliveryResult;
          return text({ ...shown(experience, read, overwrite, result), void: error.message, next: next(true, result.counts.conflict, overwrite) });
        }
        throw error;
      }
    }),
  );

  server.registerTool(
    "list_deliveries",
    {
      description: "The experience's applied deliveries, newest first: id, name, source, counts (new / changed / same / conflict), who (user, the AI connection's token name), when, and how many changes of the log name it (list_changes shows them with `delivery`). A comparison leaves no row.",
      inputSchema: z.object({ experience: EXPERIENCE, limit: z.number().int().min(1).max(500).optional().describe("default 50") }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ experience, limit }) => {
      const list = await api.call<DeliveryList>("GET", `${path(experience)}${limit ? `?limit=${limit}` : ""}`);
      return text({ ...list, open: editorHref(links, experience) });
    }),
  );
}
