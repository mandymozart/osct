/**
 * Minimal client for bunny.net's Storage API (Edge Storage): files below a storage zone, addressed as
 * `https://<endpoint>/<zone>/<path>`, authenticated with the zone's access key (`AccessKey` header).
 * Only what the CDN sync needs: put, get, exists, list, delete. Node's global fetch, no dependencies.
 */
import { createHash } from 'crypto';

export interface StorageZone {
  /** Storage endpoint host, e.g. `storage.bunnycdn.com` (or a regional one: `de.`, `sg.`, `ny.`) */
  endpoint: string;
  /** Storage zone name (the first path segment of every Storage API URL) */
  zone: string;
  /** Zone access key (read/write for uploads; the read-only key is enough for `exists` / `list`) */
  accessKey: string;
}

export interface StoredFile {
  path: string; // relative to the zone, `/`-separated
  size: number;
  isDirectory: boolean;
  /** SHA-256 (upper-case hex) the server stored for the file; null for folders or when unknown */
  checksum: string | null;
}

const RETRIES = 3;

export class StorageError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'StorageError';
  }
}

export class StorageClient {
  constructor(private readonly config: StorageZone) {}

  url(path: string): string {
    return `https://${this.config.endpoint}/${this.config.zone}/${encodePath(path)}`;
  }

  /** Uploads `data` to `path`, creating folders as needed; the server checks the SHA-256 checksum */
  async put(path: string, data: Uint8Array | string, contentType = 'application/octet-stream'): Promise<void> {
    const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const checksum = createHash('sha256').update(bytes).digest('hex').toUpperCase();
    await this.request('PUT', path, {
      headers: { 'Content-Type': contentType, Checksum: checksum },
      body: bytes,
    }, [201]);
  }

  /** Whether a file exists (HEAD is not supported by the Storage API – a ranged GET keeps it cheap) */
  async exists(path: string): Promise<boolean> {
    const response = await this.request('GET', path, { headers: { Range: 'bytes=0-0' } }, [200, 206, 404]);
    return response.status !== 404;
  }

  /** Downloads a file (null when it does not exist) */
  async get(path: string): Promise<Uint8Array | null> {
    const response = await this.request('GET', path, {}, [200, 404]);
    return response.status === 404 ? null : new Uint8Array(await response.arrayBuffer());
  }

  /** Lists a folder (empty when it does not exist) */
  async list(folder: string): Promise<StoredFile[]> {
    const response = await this.request('GET', `${folder.replace(/\/$/, '')}/`, {}, [200, 404]);
    if (response.status === 404) return [];
    const items = (await response.json()) as Array<{ ObjectName: string; Length: number; IsDirectory: boolean; Path: string; Checksum?: string | null }>;
    return items.map(item => ({
      // `Path` is `/<zone>/<folder>/`
      path: `${item.Path.replace(/^\/[^/]+\//, '')}${item.ObjectName}`,
      size: item.Length,
      isDirectory: item.IsDirectory,
      checksum: item.Checksum ? item.Checksum.toUpperCase() : null,
    }));
  }

  /** Every file and folder below `folder`, depth first (folders listed before their content) */
  async listTree(folder: string): Promise<StoredFile[]> {
    const items = await this.list(folder);
    const nested = await Promise.all(items.filter(i => i.isDirectory).map(i => this.listTree(i.path)));
    return [...items, ...nested.flat()];
  }

  /** Deletes a file, or a folder with everything in it (`path` ending in `/`); a missing path is fine */
  async delete(path: string): Promise<void> {
    await this.request('DELETE', path, {}, [200, 404]);
  }

  private async request(method: string, path: string, init: RequestInit, ok: number[]): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      try {
        const response = await fetch(this.url(path), {
          ...init,
          method,
          headers: { AccessKey: this.config.accessKey, ...(init.headers as Record<string, string> | undefined) },
        });
        if (ok.includes(response.status)) return response;
        const text = (await response.text()).slice(0, 200);
        // Client errors (bad key, bad path) do not get better with a retry
        if (response.status >= 400 && response.status < 500) {
          throw new StorageError(`${method} ${path}: ${response.status} ${response.statusText} ${text}`.trim(), response.status);
        }
        lastError = new StorageError(`${method} ${path}: ${response.status} ${response.statusText} ${text}`.trim(), response.status);
      } catch (error) {
        if (error instanceof StorageError && error.status !== undefined && error.status < 500) throw error;
        lastError = error;
      }
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
    throw lastError instanceof Error ? lastError : new StorageError(String(lastError));
  }
}

/** Percent-encodes each path segment (file names may contain spaces or non-ASCII characters) */
const encodePath = (path: string): string => path.split('/').map(segment => encodeURIComponent(segment)).join('/');

/** Content types the CDN should serve content files with (the Storage API stores what the upload says) */
export const contentTypeOf = (file: string): string => {
  const extension = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
};

const CONTENT_TYPES: Record<string, string> = {
  json: 'application/json',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  gz: 'application/gzip',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  txt: 'text/plain',
  md: 'text/markdown',
};
