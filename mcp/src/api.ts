// The instance's API over HTTP (server/api, docs/server.md) with the editor's session token – the one way in, as the
// editor app's `api.ts`: JSON calls, a file upload as the raw body with `X-File-Name`, every error as the API's
// `{ code, message }` (plus its extra fields: `role`, `components`, `usages`).

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** the error's other fields (403: `role`; 409 unknown-components: `components`; 409 asset-in-use: `usages`) */
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class OsctApi {
  constructor(
    readonly baseUrl: string,
    private token: string,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  get hasToken(): boolean {
    return this.token !== "";
  }

  setToken(token: string): void {
    this.token = token;
  }

  /** A JSON call; 204 answers undefined */
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return this.request<T>(method, path, headers, body === undefined ? undefined : JSON.stringify(body));
  }

  /** A file upload: the bytes as the body, the name in `X-File-Name` */
  async upload<T>(method: string, path: string, bytes: Uint8Array, name: string): Promise<T> {
    const headers = { Accept: "application/json", "Content-Type": "application/octet-stream", "X-File-Name": name };
    return this.request<T>(method, path, headers, bytes);
  }

  private async request<T>(method: string, path: string, headers: Record<string, string>, body: BodyInit | undefined): Promise<T> {
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, { method, headers, body });
    } catch (error) {
      throw new ApiError(0, "network", `${this.baseUrl} is not reachable: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.status === 204) return undefined as T;
    const raw = await response.text();
    let data: unknown = null;
    try {
      data = raw === "" ? null : JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!response.ok) {
      const error = (data as { error?: Record<string, unknown> } | null)?.error ?? {};
      const { code, message, ...details } = error;
      throw new ApiError(
        response.status,
        typeof code === "string" ? code : "unknown",
        typeof message === "string" ? message : `${response.status} ${response.statusText}`,
        details,
      );
    }
    return data as T;
  }
}
