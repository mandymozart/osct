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
    "Start with whoami. Every save changes the book's DRAFT (the editor's stage shows it at once) and gives the person the link to check it there.",
    "Readers are reached only by a person: publish here goes to this instance's own environment (local / staging) for a check (never with an AI connection's token); production is the editor's own Publish button. Re-importing a book takes two steps: show the person import_book's comparison first.",
  ];
  if (!services) lines.push("Not signed in: best is a token from the editor's books page (AI connections – Connect an AI agent shows the setup for each MCP client) in OSCT_EDITOR_TOKEN; else sign_in_request (the code arrives by mail – ask the person for it), then sign_in_verify.");
  else if (!services.editor) lines.push("This account has no editor role – an admin grants it on the admin page (/editor/admin).");
  else lines.push("Content: read osct://rules/content-model (or describe_content_model) before you write an entity; osct://guides/plugins before a plugin source.");
  return lines.join("\n");
}

const EDITOR = [
  "You help an editor of an OSCT book build its AR content with the OSCT tools: read the book's tree and spreads, place",
  "entities (node trees) on targets, set components and filters, upload files, write plugin sources, and publish a draft",
  "to the instance's own environment (local or staging) for a check. You have exactly the editor's rights; the API decides.",
  "",
  "Work like this: whoami, then list_books and get_spread for the spread at hand; read describe_content_model (or",
  "osct://rules/content-model) before writing an entity – node types, placement units (target widths, degrees), filters,",
  "components. Change only what was asked: put_entity for a shared entity, put_target for a target's own entity, image or",
  "printed place, add_entry for a new target on a page (its image is an uploaded asset's url: upload_asset first);",
  "add_spread / put_spread / delete_spread for the spreads themselves, put_book_passes and put_environment for the book's",
  "post-processing and its world.",
  "Every save is the draft the editor shows – give the person the link from the result so they check it on the stage.",
  "Plugins: osct://guides/plugins, then put_plugin; the Code tab's Run shows it on the stage, the content build ships it.",
  "",
  "Never publish to production – that is the person's button in the editor. publish (local or staging, the instance's own) only when asked.",
  "import_book over an existing book answers a comparison first: show it to the person and confirm only with their yes.",
  "When something is unclear or risky, ask before saving. Finish with a short summary: which spreads and targets, the links.",
].join("\n");

const user = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

export function registerPrompts(server: McpServer, services: Services | null): void {
  if (!services?.editor) return;
  server.registerPrompt(
    "editor",
    { title: "OSCT: work on a book", description: "How to read a book's spreads, place entities, write plugins and hand the draft to the person." },
    () => user(`${EDITOR}\n\nRead this, then ask me what I want to work on.`),
  );
  server.registerPrompt(
    "add-target",
    {
      title: "OSCT: add a target to a spread",
      description: "A new target on a page with its printed image, placement and AR content, as a draft.",
      argsSchema: z.object({
        book: z.string().describe("the book's id (list_books)"),
        page: z.string().describe("the page the target is printed on"),
        what: z.string().describe("what should appear – e.g. a tinted video, a model standing on the page"),
      }),
    },
    ({ book, page, what }) =>
      user(
        `${EDITOR}\n\nAdd a target to book "${book}" on page ${page}: ${what}. Read the spread first (get_spread by page), describe_content_model for what you may write, upload the files with upload_asset, make the entry with add_entry (the printed place in mm, the entity as a node tree), check the result with get_spread and give me the link to the spread.`,
      ),
  );
}
