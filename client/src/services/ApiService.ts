import { isObject } from "@shared/guards/game-config";

/**
 * Base URL of the accounts API (`server/`, PHP + MySQL), from the build flag `VITE_API_URL` (set per Kamal
 * destination, RULES #11 – `/api` next to the app, on the same origin: the session is the API's cookie). `npm run dev`
 * defaults to `/api`, which Vite proxies to `npm run dev:api`. Empty = account features disabled.
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
  /**
   * A session token sent as `Authorization: Bearer` – only the one-time exchange of a token a reader app from before the
   * cookie stored (`POST /auth/cookie`, #207, temporary) and that token's sign-out. Every other call goes with the cookie.
   */
  token?: string | null;
}

/** The API's error code from an error body `{ error: { code, message, … } }` */
const errorCode = (data: unknown): string | null =>
  isObject(data) && isObject(data.error) && typeof data.error.code === "string" ? data.error.code : null;

const WRITE = /^(POST|PUT|PATCH|DELETE)$/i;

/**
 * JSON client for the accounts API (singleton); disabled when no base URL is configured.
 *
 * The session (#207, docs/server.md "Sessions, cookies and CSRF") is the API's HttpOnly cookie – shared with the editor
 * on the same site, readable by no script: every call goes with it (`credentials: "same-origin"`). What this client holds
 * is the session's CSRF token, in memory only (`setCsrfToken`, from the sign-in or `GET /user`), sent in `X-CSRF-Token`
 * with every write. A write the API refuses with 403 `csrf` (no token yet – the app started offline –, or the cookie was
 * replaced by a sign-in in the editor) reads the token again from `GET /user` and is sent once more.
 */
export class ApiService {
  private static instance: ApiService | null = null;

  /** The cookie session's CSRF token; null signed out or not known yet */
  private csrfToken: string | null = null;

  static getInstance(): ApiService {
    if (!ApiService.instance) ApiService.instance = new ApiService();
    return ApiService.instance;
  }

  constructor(private readonly baseUrl: string = API_URL) {}

  isEnabled(): boolean {
    return this.baseUrl !== "";
  }

  /** The CSRF token of the session a sign-in or `GET /user` answered; null when signed out */
  setCsrfToken(token: string | null): void {
    this.csrfToken = token;
  }

  /** Sends JSON, returns the parsed JSON response unchecked (null for 204); throws `ApiError` on any failure. */
  async request(method: string, path: string, { body, token }: ApiRequest = {}): Promise<unknown> {
    let response = await this.send(method, path, body, token);
    if (!token && WRITE.test(method) && (await this.isCsrfRefusal(response)) && (await this.renewCsrf())) {
      response = await this.send(method, path, body, token);
    }
    return this.read(response);
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

  private async send(method: string, path: string, body: unknown, token: string | null | undefined): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (this.csrfToken && WRITE.test(method)) headers["X-CSRF-Token"] = this.csrfToken;
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch {
      throw new ApiError(0, "offline");
    }
  }

  private async read(response: Response): Promise<unknown> {
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

  private async isCsrfRefusal(response: Response): Promise<boolean> {
    if (response.status !== 403) return false;
    return errorCode(await response.clone().json().catch(() => null)) === "csrf";
  }

  /** The session's CSRF token read again from `GET /user`; a 401 there (no session) is thrown on – the caller signs out */
  private async renewCsrf(): Promise<boolean> {
    const data = await this.read(await this.send("GET", "/user", undefined, null)).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) throw error;
      return null;
    });
    if (!isObject(data) || typeof data.csrfToken !== "string") return false;
    this.csrfToken = data.csrfToken;
    return true;
  }
}
