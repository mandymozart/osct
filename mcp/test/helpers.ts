import type { McpServer } from "@modelcontextprotocol/server";
import { OsctApi } from "../src/api.ts";
import type { Result } from "../src/result.ts";

/** One request the fake API saw */
export interface Seen {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string | Uint8Array | undefined;
}

export type Route = (seen: Seen) => { status?: number; json?: unknown; text?: string } | undefined;

/** A `fetch` that answers from `route` and logs every request */
export function fakeFetch(route: Route, baseUrl = "http://api.test/api") {
  const seen: Seen[] = [];
  const fetchFn: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const path = url.startsWith(baseUrl) ? url.slice(baseUrl.length) : url;
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    const rawBody = init.body as string | Uint8Array | undefined;
    let body: unknown = undefined;
    if (typeof rawBody === "string") {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    } else body = rawBody;
    const request: Seen = { method: init.method ?? "GET", path, headers, body, rawBody };
    seen.push(request);
    const answer = route(request) ?? { status: 404, json: { error: { code: "not-found", message: "Unknown endpoint." } } };
    const status = answer.status ?? 200;
    const text = answer.text ?? (answer.json === undefined ? "" : JSON.stringify(answer.json));
    return new Response(status === 204 ? null : text, { status, headers: { "Content-Type": "application/json" } });
  };
  return { fetchFn, seen, api: (token = "tok") => new OsctApi(baseUrl, token, fetchFn) };
}

type Handler = (args: Record<string, unknown>, extra?: unknown) => Promise<Result> | Result;

/** Stands in for the McpServer: records what is registered so tests call the handlers directly */
export function recorder() {
  const tools = new Map<string, { config: Record<string, unknown>; handler: Handler }>();
  const prompts = new Map<string, { config: Record<string, unknown>; handler: (args?: Record<string, unknown>) => unknown }>();
  const resources = new Map<string, { uri: string; config: Record<string, unknown>; read: (uri: URL) => Promise<unknown> }>();
  let listChanged = 0;
  const server = {
    registerTool: (name: string, config: Record<string, unknown>, handler: Handler) => {
      if (tools.has(name)) throw new Error(`tool ${name} registered twice`);
      tools.set(name, { config, handler });
      return {};
    },
    registerPrompt: (name: string, config: Record<string, unknown>, handler: (args?: Record<string, unknown>) => unknown) => {
      prompts.set(name, { config, handler });
      return {};
    },
    registerResource: (name: string, uri: string, config: Record<string, unknown>, read: (uri: URL) => Promise<unknown>) => {
      resources.set(name, { uri, config, read });
      return {};
    },
    sendToolListChanged: () => {
      listChanged++;
    },
    sendPromptListChanged: () => undefined,
    sendResourceListChanged: () => undefined,
  };
  /** calls a tool after validating its arguments with the registered zod schema */
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; data: any; raw: string }> => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`no tool ${name} (${[...tools.keys()].join(", ")})`);
    const schema = tool.config.inputSchema as { parse: (value: unknown) => Record<string, unknown> } | undefined;
    const parsed = schema ? schema.parse(args) : args;
    const result = await tool.handler(parsed);
    const raw = result.content.map(c => c.text).join("");
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // a plain text answer
    }
    return { ok: !result.isError, data, raw };
  };
  return { server: server as unknown as McpServer, tools, prompts, resources, call, get listChanged() { return listChanged; } };
}

/** A small valid node tree */
export const VIDEO_ENTITY = {
  type: "video",
  assets: [{ id: "v", assetType: "video", src: "http://api.test/api/content/assets/osct/a/v1.mp4" }],
  params: { rotation: [90, 0, 0], position: [0, 0, 0.25], scale: 0.5 },
  filters: [{ type: "chromaKey", color: "#00ff00" }],
};
