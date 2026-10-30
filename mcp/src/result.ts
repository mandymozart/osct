// Tool results and errors in one shape: a JSON text for the agent; an API error as `{ error: { status, code, message,
// …details } }` with a hint the agent can act on (`isError`), so the API's codes travel unchanged.
import { ApiError } from "./api.ts";

export type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

export const text = (value: unknown): Result => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 1) }],
});

export const fail = (value: unknown): Result => ({ ...text(value), isError: true });

/**
 * The codes `POST /editor/books/{id}/publish` refuses with (`Books::publish`, `Auth::refuseToken`, `ContentStore`) besides
 * a missing sign-in or role – each has a hint, and the publish tool's description names them
 */
export const PUBLISH_REFUSALS = [
  "not-for-ai",
  "invalid-env",
  "other-environment",
  "invalid-note",
  "invalid-replace",
  "not-found",
  "other-book",
  "unknown-components",
  "unknown-node-types",
  "unknown-materials",
  "content-store-failed",
  "content-store-unconfigured",
] as const;

/** What the publish refuses about the content: a type no compiled plugin provides, and where the plugins come from */
const UNCOMPILED = "the publish refuses it; the Code tab's sources reach readers through the content build only.";

/** What the agent should do about an API answer, by status and code */
export function hintFor(error: ApiError): string {
  if (error.status === 0) return "The API is not running or OSCT_API_URL is wrong.";
  if (error.code === "token-expired") return "The token in OSCT_EDITOR_TOKEN has expired – the person renews it on the editor's books page (AI connections); the same token works again.";
  if (error.code === "token-revoked") return "The token in OSCT_EDITOR_TOKEN was revoked – the person makes a new one on the editor's books page (AI connections) and restarts this server with it.";
  if (error.code === "no-editor-role") return "The token's account has no editor role any more – an admin grants it on the admin page.";
  if (error.status === 401) return "Not signed in: set OSCT_EDITOR_TOKEN to a token made on the editor's books page (AI connections), or use sign_in_request and sign_in_verify (the code arrives by mail).";
  if (error.code === "not-for-ai") return "An AI connection's token may not do this (publishing, tokens, the password, the account) – the person does it in the editor; give them the link.";
  if (error.code === "other-environment") return `This instance publishes to its own environment only (${String(error.details.env ?? "")}) – another environment is published from its own editor.`;
  if (error.code === "confirm-import") return "Nothing was imported: show the person the comparison and ask – only with their yes import again with confirm: confirmation.id.";
  if (error.code === "confirm-delete") return "Nothing was removed: show the person the impact and ask – only with their yes remove again with confirm: confirmation.id (deleteFiles: true only if they asked).";
  if (error.code === "confirmation-void") return "The confirmation no longer fits (expired, or the book changed): show the person the new comparison or impact and ask again – then send the new confirmation.id.";
  if (error.status === 403) return `This account lacks the role ${String(error.details.role ?? "editor")} – an admin grants it on the admin page.`;
  if (error.code === "unknown-components") return `A node uses a component type no compiled plugin provides – ${UNCOMPILED}`;
  if (error.code === "unknown-node-types") return `A node has a type no compiled plugin provides – ${UNCOMPILED}`;
  if (error.code === "unknown-materials") return `A node uses a material no compiled plugin provides – ${UNCOMPILED}`;
  if (error.code === "other-book") return "The environment serves another book (current) – replacing it there is the person's decision: they publish in the editor and confirm the replacement.";
  if (error.code === "invalid-env") return "env is the instance's own environment – leave it out to publish there.";
  if (error.code === "invalid-note") return "note is a line of text for the publish log.";
  if (error.code === "invalid-replace") return "replace is true or false – and replacing another book is the person's decision in the editor, never this tool's.";
  if (error.code === "content-store-failed") return "The environment's content store could not be read or written – nothing went live; the person checks the store (or versions.json) and publishes again.";
  if (error.code === "content-store-unconfigured") return "The instance's CDN storage is not configured – the person who runs the instance sets it up; nothing was published.";
  if (error.code === "asset-in-use") return "The asset is used – remove the uses first, or delete with force: true.";
  if (error.code === "plugin-in-use") return "The draft uses what the plugin registers – remove those uses first (plugin_usages lists them), or delete with force: true.";
  if (error.code === "plugin-exists") return "A plugin with that id exists – replace its source with replace: true, or give another plugin id.";
  if (error.code === "duplicate-id") return "Pick another id, or delete the entry first.";
  if (error.code === "unknown-entity") return "No shared entity with that ref – list them with get_book or save one with put_entity.";
  if (error.code === "initial-spread") return "The book opens on this spread – it cannot be removed.";
  if (error.code === "not-found") return "Nothing with that id here – list_books, get_book and list_assets name what exists.";
  return "";
}

/** An error as the agent reads it: the API's own code and message, the extra fields, a hint */
export function failure(error: unknown): Result {
  if (error instanceof ApiError) {
    const hint = hintFor(error);
    return fail({ error: { status: error.status, code: error.code, message: error.message, ...error.details, ...(hint ? { hint } : {}) } });
  }
  return fail({ error: { code: "mcp", message: error instanceof Error ? error.message : String(error) } });
}

/** Wraps a tool body: API errors become tool errors the agent can act on */
export const guard =
  <A>(fn: (args: A) => Promise<Result>) =>
  async (args: A): Promise<Result> => {
    try {
      return await fn(args);
    } catch (error) {
      return failure(error);
    }
  };
