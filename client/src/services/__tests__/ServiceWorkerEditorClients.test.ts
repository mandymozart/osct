import { describe, expect, it, vi } from "vitest";
import { EditorClients, isEditorPage } from "../../../sw/editor-clients";

const clients = (open: Array<{ id: string; url: string }>) => ({
  get: vi.fn(async (id: string) => open.find(client => client.id === id)),
  matchAll: vi.fn(async () => open),
});
const cdnImage = (clientId: string) => ({
  request: { mode: "no-cors", url: "https://cdn.example/staging/2e0a4af94ca2/assets/content/entries/p015-1/target.jpg" },
  clientId,
});

describe("service worker: editor pages (#122)", () => {
  it("knows the editor's pages by their path", () => {
    expect(isEditorPage("https://osct.example/editor")).toBe(true);
    expect(isEditorPage("https://osct.example/editor/books/osct/library")).toBe(true);
    expect(isEditorPage("https://osct.example/")).toBe(false);
    expect(isEditorPage("https://osct.example/chapters/1")).toBe(false);
    expect(isEditorPage("https://osct.example/editorial")).toBe(false);
  });

  it("leaves a navigation to the editor and the new page's requests to the browser", () => {
    const editor = new EditorClients(clients([]));
    expect(editor.bypasses({ request: { mode: "navigate", url: "https://osct.example/editor/" }, clientId: "", resultingClientId: "e1" })).toBe(true);
    expect(editor.bypasses(cdnImage("e1"))).toBe(true);
  });

  it("keeps handling the reader's navigations and requests", () => {
    const editor = new EditorClients(clients([]));
    expect(editor.bypasses({ request: { mode: "navigate", url: "https://osct.example/chapters/1" }, clientId: "", resultingClientId: "r1" })).toBe(false);
    expect(editor.bypasses(cdnImage("r1"))).toBe(false);
  });

  it("finds the editor pages that were open before the worker (re)started", async () => {
    const editor = new EditorClients(clients([{ id: "e1", url: "https://osct.example/editor/books" }, { id: "r1", url: "https://osct.example/" }]));
    await editor.refresh();
    expect(editor.bypasses(cdnImage("e1"))).toBe(true);
    expect(editor.bypasses(cdnImage("r1"))).toBe(false);
  });

  it("asks the browser for a page it does not know yet", async () => {
    const open = clients([{ id: "e2", url: "https://osct.example/editor/books" }, { id: "r1", url: "https://osct.example/" }]);
    const editor = new EditorClients(open);
    expect(editor.bypasses(cdnImage("e2"))).toBe(false);
    expect(await editor.isEditor("e2")).toBe(true);
    expect(editor.bypasses(cdnImage("e2"))).toBe(true);
    expect(await editor.isEditor("r1")).toBe(false);
    expect(await editor.isEditor("")).toBe(false);
    expect(open.get).toHaveBeenCalledTimes(2);
  });
});
