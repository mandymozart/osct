import { isObject } from "@shared/guards/game-config";

/**
 * Base URL of the accounts API (`server/`, PHP + MySQL), from the build flag `VITE_API_URL` (set per Kamal
 * destination, RULES #11 – `/api` next to the app). `npm run dev` defaults to `/api`,
 * which Vite proxies to `npm run dev:api`. Empty = account features disabled.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "/api" : "")).replace(/\/$/, "");

/**
 * A failed API call. `code`: the API's error code (`invalid-code`, `expired` …), `offline` when the server
 * is unreachable, `server-error` for an unreadable response or one of the wrong shape (`requestAs`, status 502).
 * `data`: the full response body (used for 409 conflicts).
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

/** The API's error code from an error body `{ error: { code, message, … } }` */
const errorCode = (data: unknown): string | null =>
  isObject(data) && isObject(data.error) && typeof data.error.code === "string" ? data.error.code : null;

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

  /** Sends JSON, returns the parsed JSON response unchecked (null for 204); throws `ApiError` on any failure. */
  async request(method: string, path: string, { body, token }: ApiRequest = {}): Promise<unknown> {
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
    if (response.status === 204) return null;
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(response.status, "server-error");
    }
    if (!response.ok) throw new ApiError(response.status, errorCode(data) ?? "server-error", data);
    return data;
  }

  /**
   * `request`, then checks the response's shape: a body `isResponse` refuses is an `ApiError` `server-error`
   * (status 502 – the server answered, but not what this app expects).
   */
  async requestAs<T>(isResponse: (data: unknown) => data is T, method: string, path: string, request?: ApiRequest): Promise<T> {
    const data = await this.request(method, path, request);
    if (!isResponse(data)) throw new ApiError(502, "server-error", data);
    return data;
  }
}
