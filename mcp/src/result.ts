// Tool results and errors in one shape: a JSON text for the agent; an API error as `{ error: { status, code, message,
// …details } }` with a hint the agent can act on (`isError`), so the API's codes travel unchanged.
import { ApiError } from "./api.ts";

export type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

export const text = (value: unknown): Result => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 1) }],
});

export const fail = (value: unknown): Result => ({ ...text(value), isError: true });

/** What the agent should do about an API answer, by status and code */
export function hintFor(error: ApiError): string {
  if (error.status === 0) return "The API is not running or OSCT_API_URL is wrong.";
  if (error.status === 401) return "Not signed in: set OSCT_EDITOR_TOKEN, or use sign_in_request and sign_in_verify (the code arrives by mail).";
  if (error.status === 403) return `This account lacks the role ${String(error.details.role ?? "editor")} – an admin grants it on the admin page.`;
  if (error.code === "unknown-components") return "A node uses a component type no compiled plugin provides – the publish refuses it; the Code tab's sources reach readers through the content build only.";
  if (error.code === "asset-in-use") return "The asset is used – remove the uses first, or delete with force: true.";
  if (error.code === "duplicate-id") return "Pick another id, or delete the entry first.";
  if (error.code === "unknown-node-types") return "A node has a type no compiled plugin provides – the publish refuses it; the Code tab's sources reach readers through the content build only.";
  if (error.code === "unknown-entity") return "No shared entity with that ref – list them with get_book or save one with put_entity.";
  if (error.code === "spread-not-empty") return "Entries are on the spread – delete them one by one with delete_entry first (they carry targets and AR), then the spread.";
  if (error.code === "initial-spread") return "The book opens on this spread – it cannot be removed.";
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
