// What an agent reads before writing (MCP resources `osct://…`): the content model from the shared contract, and the
// authors' plugin guide from the checkout's docs – read at start-up, so they follow the code.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { ROOT } from "./config.ts";
import { describeContentModel } from "./model.ts";

export interface Rule {
  name: string;
  uri: string;
  title: string;
  description: string;
  mimeType: string;
  text: () => string;
}

const doc = (file: string, fallback: string) => {
  const path = resolve(ROOT, file);
  return existsSync(path) ? readFileSync(path, "utf8") : fallback;
};

export const RULES: Rule[] = [
  {
    name: "content-model",
    uri: "osct://rules/content-model",
    title: "OSCT: the content model",
    description: "Node types, placement, filters, components, printed placement, entry categories – what put_entity, put_target and add_entry accept (the shared content contract).",
    mimeType: "application/json",
    text: () => JSON.stringify(describeContentModel(), null, 1),
  },
  {
    name: "plugins-guide",
    uri: "osct://guides/plugins",
    title: "OSCT: writing a plugin",
    description: "The authors' guide to the book's own code: a material layer, a component, the Code tab, the content build (docs/plugins.md).",
    mimeType: "text/markdown",
    text: () => doc("docs/plugins.md", "The plugin guide (docs/plugins.md) is not in reach of this server – run it from the repository."),
  },
];

export function registerResources(server: McpServer): void {
  for (const rule of RULES) {
    server.registerResource(rule.name, rule.uri, { title: rule.title, description: rule.description, mimeType: rule.mimeType }, async uri => ({
      contents: [{ uri: uri.href, mimeType: rule.mimeType, text: rule.text() }],
    }));
  }
}
