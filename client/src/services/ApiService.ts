/**
 * Base URL of the accounts API (`server/`, PHP + MySQL), from the build flag `VITE_API_URL` (set per deploy,
 * see RULES.md #11: `/api` on the production host, the full URL on staging). `npm run dev` defaults to `/api`,
 * which Vite proxies to `npm run dev:api`. Empty = account features disabled.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "/api" : "")).replace(/\/$/, "");

/**
 * A failed API call. `code`: the API's error code (`invalid-code`, `expired` …), `offline` when the server
 * is unreachable, `server-error` for an unreadable response. `data`: the full response body (used for 409 conflicts).
 */
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly data?: unknown) {
    super(code);
    this.name = "ApiError";
  }
}

export interface ApiRequest {
  body?: unknown;
  /** Session token (Authorization: Bearer) */
  token?: string | null;
}

/** JSON client for the accounts API (singleton); disabled when no base URL is configured. */
export class ApiService {
  private static instance: ApiService | null = null;

  static getInstance(): ApiService {
    if (!ApiService.instance) ApiService.instance = new ApiService();
    return ApiService.instance;
  }

  constructor(private readonly baseUrl: string = API_URL) {}

  isEnabled(): boolean {
    return this.baseUrl !== "";
  }

  /** Sends JSON, returns the parsed JSON response (null for 204); throws `ApiError` on any failure. */
  async request<T>(method: string, path: string, { body, token }: ApiRequest = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      throw new ApiError(0, "offline");
    }
    if (response.status === 204) return null as T;
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(response.status, "server-error");
    }
    if (!response.ok) {
      const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
      throw new ApiError(response.status, typeof code === "string" ? code : "server-error", data);
    }
    return data as T;
  }
}
