// The server's own version against its instance's (#367). The one-file server (`osct-mcp.mjs`, #272) is the version
// its instance served on the day it was downloaded; after a deploy of the instance its tools may no longer fit the
// API. So the server reads the instance's version (`GET /health` → `version`) at start, on `whoami` and when a call
// fails the way an outdated client fails – and `update_server` replaces its own file with the one the instance serves
// now (`/mcp/osct-mcp.mjs`). A running process keeps its tools: the client reconnects the server to load the new file.
// A checkout (`mcp/bin/osct-mcp.mjs`) bundles its current code at every start and is never overwritten – it is pulled.
import { copyFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { OsctApi } from "./api.ts";

/** The docs the one-file bundle carries (scripts/bundle.mjs defines it) – here only the sign that this is the bundle */
declare const OSCT_BUNDLED_DOCS: Record<string, string> | undefined;

/** The first two lines scripts/bundle.mjs writes into the file, with its version */
const BANNER = /^#!\/usr\/bin\/env node\r?\n\/\/ OSCT MCP server (\d+\.\d+\.\d+) /;

/** How the person loads a new file into the client */
export const RECONNECT =
  "The person reconnects this MCP server so the client loads the new file – Claude Code: /mcp → the server → Reconnect; Claude Desktop, Cursor and others: restart the app (or turn the server off and on).";

/** Where this server runs from: the downloaded one-file server (replaceable) or a checkout's build (pulled, never replaced) */
export interface SelfFile {
  kind: "bundle" | "checkout";
  path: string;
}

export function selfFile(): SelfFile {
  return { kind: typeof OSCT_BUNDLED_DOCS === "undefined" ? "checkout" : "bundle", path: fileURLToPath(import.meta.url) };
}

export interface VersionStatus {
  /** this server's version */
  mcp: string;
  /** the instance's (GET /health), null when it could not be read */
  instance: string | null;
  /** the instance is newer: update_server fetches its file */
  outdated: boolean;
  /** set after update_server wrote a new file this process has not loaded yet */
  updatedTo?: string;
}

/** -1, 0 or 1 for two `X.Y.Z` versions; anything else compares as equal */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : null);
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** The version in a downloaded file's banner, or null when it is not the OSCT MCP server */
export function bannerVersion(source: string): string | null {
  return BANNER.exec(source)?.[1] ?? null;
}

/** Writes next to the file, then moves it over (a half-written file never runs); copies when the move is refused */
function replaceFile(path: string, source: string): void {
  const temp = `${path}.download`;
  writeFileSync(temp, source);
  try {
    renameSync(temp, path);
  } catch {
    copyFileSync(temp, path);
    rmSync(temp, { force: true });
  }
}

export interface UpdateResult {
  updated: boolean;
  /** the update was wanted but did not happen (the instance, the download, the file) – a tool error */
  failed?: boolean;
  from: string;
  to?: string;
  instance: string | null;
  file?: string;
  message: string;
  next?: string;
}

export class Versions {
  private status: VersionStatus | null = null;
  private checkedAt = 0;
  private updatedTo: string | undefined;

  constructor(
    private readonly api: OsctApi,
    readonly current: string,
    readonly self: SelfFile = selfFile(),
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
    private readonly write: (path: string, source: string) => void = replaceFile,
    private readonly now: () => number = Date.now,
  ) {}

  /** the server file the instance serves next to its API */
  get downloadUrl(): string {
    return `${new URL(this.api.baseUrl).origin}/mcp/osct-mcp.mjs`;
  }

  /** The last check's answer, null before the first */
  get last(): VersionStatus | null {
    return this.status;
  }

  /** Reads the instance's version (at most once a minute unless `maxAgeMs` says otherwise); never throws */
  async check(maxAgeMs = 60_000): Promise<VersionStatus> {
    if (this.status && this.now() - this.checkedAt < maxAgeMs) return this.status;
    let instance: string | null = null;
    try {
      const health = await this.api.call<{ version?: unknown }>("GET", "/health");
      instance = typeof health?.version === "string" ? health.version : null;
    } catch {
      instance = null;
    }
    this.checkedAt = this.now();
    this.status = {
      mcp: this.current,
      instance,
      outdated: instance !== null && compareVersions(this.updatedTo ?? this.current, instance) < 0,
      ...(this.updatedTo ? { updatedTo: this.updatedTo } : {}),
    };
    return this.status;
  }

  /** What an agent reads about the versions (whoami, a failing call) */
  async describe(): Promise<VersionStatus & { next?: string }> {
    const status = await this.check();
    if (status.updatedTo) return { ...status, next: `update_server wrote ${status.updatedTo}; it runs once reconnected. ${RECONNECT}` };
    if (!status.outdated) return status;
    return {
      ...status,
      next:
        this.self.kind === "bundle"
          ? `This server is older than its instance – call update_server, then the person reconnects it.`
          : `This server runs from a checkout older than its instance – git pull (npm ci in mcp/ when its dependencies changed), then reconnect.`,
    };
  }

  /** Replaces this server's file with the one the instance serves – only a newer one, unless `force` */
  async update(force = false): Promise<UpdateResult> {
    const status = await this.check(0);
    const base = { updated: false, from: this.current, instance: status.instance };
    if (this.self.kind === "checkout") {
      return {
        ...base,
        message: `This server runs from a checkout (${this.self.path}) and bundles the checkout's code at every start – it is not replaced.`,
        next: status.outdated ? "git pull (npm ci in mcp/ when its dependencies changed), then reconnect the server." : undefined,
      };
    }
    if (!status.outdated && !force) {
      return status.instance === null
        ? { ...base, failed: true, message: "The instance's version could not be read (GET /health) – is OSCT_API_URL right and the instance up?" }
        : { ...base, message: `Up to date: this server is ${this.current}, the instance ${status.instance}.` };
    }

    let source: string;
    try {
      const response = await this.fetchFn(this.downloadUrl);
      if (!response.ok) return { ...base, failed: true, message: `${this.downloadUrl} answered ${response.status} – nothing was replaced.` };
      source = await response.text();
    } catch (error) {
      return { ...base, failed: true, message: `${this.downloadUrl} is not reachable: ${error instanceof Error ? error.message : String(error)} – nothing was replaced.` };
    }
    const version = bannerVersion(source);
    if (!version) return { ...base, failed: true, message: `${this.downloadUrl} is not the OSCT MCP server – nothing was replaced.` };
    if (!force && compareVersions(version, this.updatedTo ?? this.current) <= 0) {
      return { ...base, to: version, message: `The instance serves ${version}, no newer than this server – nothing was replaced.` };
    }

    try {
      this.write(this.self.path, source);
    } catch (error) {
      return { ...base, failed: true, to: version, message: `${this.self.path} could not be written: ${error instanceof Error ? error.message : String(error)} – the person downloads ${this.downloadUrl} over it by hand.` };
    }
    this.updatedTo = version;
    this.status = { ...status, outdated: status.instance !== null && compareVersions(version, status.instance) < 0, updatedTo: version };
    return { updated: true, from: this.current, to: version, instance: status.instance, file: this.self.path, message: `Updated ${this.current} → ${version}.`, next: RECONNECT };
  }
}
