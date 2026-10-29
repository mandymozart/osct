/**
 * The editor is served at /editor next to the reader (editor/svelte.config.js), so its pages are inside the
 * reader worker's scope (`/`) and their requests reach the worker. The worker leaves them to the browser: its
 * content cache is the reader's offline copy, the editor shows the draft and has no use for it (#122: Firefox
 * broke some of the Library's CDN thumbnails when they went through the worker's CDN rule).
 */

interface WindowClient { id: string; url: string }
interface ClientList {
  get(id: string): Promise<WindowClient | undefined | null>;
  matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<readonly WindowClient[]>;
}
interface FetchEventLike { request: { mode: string; url: string }; clientId: string; resultingClientId?: string }

/** A page of the editor (`/editor`, `/editor/…`) */
export const isEditorPage = (href: string): boolean => {
  const { pathname } = new URL(href);
  return pathname === "/editor" || pathname.startsWith("/editor/");
};

/** The open editor pages, by client id */
export class EditorClients {
  private readonly ids = new Set<string>();

  constructor(private readonly clients: ClientList) {}

  /** The editor pages already open (a worker the browser stopped and restarted starts with none) */
  async refresh(): Promise<void> {
    for (const client of await this.clients.matchAll({ type: "window", includeUncontrolled: true })) {
      if (isEditorPage(client.url)) this.ids.add(client.id);
    }
  }

  /**
   * Synchronous (a fetch listener must decide before it returns): true for a navigation to an editor page
   * (its new page is remembered) and for every request of an editor page seen before.
   */
  bypasses(event: FetchEventLike): boolean {
    if (event.request.mode === "navigate") {
      if (!isEditorPage(event.request.url)) return false;
      if (event.resultingClientId) this.ids.add(event.resultingClientId);
      return true;
    }
    return this.ids.has(event.clientId);
  }

  /** For a request bypasses() did not know: asks the browser which page sent it */
  async isEditor(clientId: string): Promise<boolean> {
    if (!clientId) return false;
    if (this.ids.has(clientId)) return true;
    const client = await this.clients.get(clientId);
    if (!client || !isEditorPage(client.url)) return false;
    this.ids.add(client.id);
    return true;
  }
}
