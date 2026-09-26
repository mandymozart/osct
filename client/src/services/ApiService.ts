/**
 * The accounts API (`server/`, PHP + MySQL). Base URL from the build flag `VITE_API_URL` (set per Netlify
 * site / deploy, RULES #11 – e.g. `/api` on the production host, the full URL on staging); `npm run dev`
 * uses `/api`, which vite passes on to `npm run dev:api` (php -S). Without it the account features are off.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "/api" : "")).replace(/\/$/, "");

/**
 * A failed call: `code` is the API's error code (`invalid-code`, `expired` …), `offline` when the server
 * could not be reached, `server-error` for an unreadable answer. `data` = the whole answer (409 conflict).
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

  /** JSON in, JSON out; throws `ApiError` (null for 204) */
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
