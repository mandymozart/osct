// What the editor's AI is told: the server's `instructions` (short: what it is, where to start, what never happens
// by itself) and the MCP prompts a person picks in their client (any MCP client's prompt menu – Claude Desktop's "+",
// Claude Code's `/` commands). The text names no particular agent: Claude, Codex, OpenCode or Cursor read the same.
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { Services } from "./services.ts";

/** the server's instructions: what it is, who the user is, where to start */
export function instructions(services: Services | null, api: string, local: boolean): string {
  const lines = [
    `OSCT (${local ? "LOCAL dev API" : api}) – you act as the signed-in editor with exactly their rights; the API decides.`,
    "Start with whoami. Every save changes the experience's DRAFT (the editor's stage shows it at once) and gives the person the link to check it there.",
    "Readers are reached only by a person: publish here goes to this instance's own environment (local / staging) for a check (never with an AI connection's token); production is the editor's own Publish button. Re-importing an experience takes two steps: show the person import_experience's comparison first.",
  ];
  if (!services) lines.push("Not signed in: best is a token from the editor's experiences page (AI connections – Connect an AI agent shows the setup for each MCP client) in OSCT_EDITOR_TOKEN; else sign_in_request (the code arrives by mail – ask the person for it), then sign_in_verify.");
  else if (!services.editor) lines.push("This account has no editor role – an admin grants it on the admin page (/editor/admin).");
  else lines.push("Content: read osct://rules/content-model (or describe_content_model) before you write an entity; osct://guides/plugins before a plugin source.");
  return lines.join("\n");
}

const EDITOR = [
  "You help an editor of an OSCT experience build its AR content with the OSCT tools: read the experience's tree and its scenes, place",
  "entities (node trees) on targets, set components and filters, upload files, write plugin sources, and publish a draft",
  "to the instance's own environment (local or staging) for a check. You have exactly the editor's rights; the API decides.",
  "",
  "Work like this: whoami, then list_experiences and get_scene for the scene at hand (get_experience lists them all); read",
  "describe_content_model (or osct://rules/content-model) before writing an entity – node types, placement units (target",
  "widths, degrees), filters, components. Change only what was asked: put_entity for a shared entity, put_target for a",
  "target's own entity, image or place on a surface, add_entry for a new target on a scene (its image is an uploaded",
  "asset's url: upload_asset first); list_scenes / add_scene / put_scene / move_scenes / delete_scene for the scenes",
  "themselves and their surfaces, put_experience_passes, put_experience_appearance and put_environment for the experience's",
  "post-processing, how its entities appear and its world.",
  "Every save is the draft the editor shows – give the person the link from the result so they check it on the stage.",
  "Plugins: osct://guides/plugins, then put_plugin; the Code tab's Run shows it on the stage, the person's next Publish takes it to readers.",
  "",
  "Never publish to production – that is the person's button in the editor. publish (local or staging, the instance's own) only when asked.",
  "import_experience over an existing experience answers a comparison first: show it to the person and go on only with their yes.",
  "When something is unclear or risky, ask before saving. Finish with a short summary: which scenes and targets, the links.",
].join("\n");

const user = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

export function registerPrompts(server: McpServer, services: Services | null): void {
  if (!services?.editor) return;
  server.registerPrompt(
    "editor",
    { title: "OSCT: work on an experience", description: "How to read an experience's scenes, place entities, write plugins and hand the draft to the person." },
    () => user(`${EDITOR}\n\nRead this, then ask me what I want to work on.`),
  );
  server.registerPrompt(
    "add-target",
    {
      title: "OSCT: add a target to a scene",
      description: "A new target on a scene with its printed image, its place on a surface and its AR content, as a draft.",
      argsSchema: z.object({
        experience: z.string().describe("the experience's id (list_experiences)"),
        scene: z.string().describe("the scene the target lies on – its id or its label (get_experience)"),
        what: z.string().describe("what should appear – e.g. a tinted video, a model standing on the page"),
      }),
    },
    ({ experience, scene, what }) =>
      user(
        `${EDITOR}\n\nAdd a target to experience "${experience}" on scene ${scene}: ${what}. Find the scene first (get_experience – by its id or label – then get_scene), describe_content_model for what you may write, upload the files with upload_asset, make the entry with add_entry (scene, surface, the target's place in mm on that surface, the entity as a node tree), check the result with get_scene and give me the link to the scene.`,
      ),
  );
}
