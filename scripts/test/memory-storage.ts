import { sha256, StorageClient, type StoredFile } from '../src/lib/storage';

/** A storage zone in memory: files by path, folders implied by the paths */
export class MemoryStorage extends StorageClient {
  files = new Map<string, Buffer>();
  puts: string[] = [];
  deletes: string[] = [];

  constructor() {
    super({ endpoint: 'storage.example', zone: 'osct', accessKey: 'key' });
  }

  async put(path: string, data: Uint8Array | string): Promise<void> {
    this.puts.push(path);
    this.files.set(path, typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data));
  }

  async get(path: string): Promise<Uint8Array | null> {
    return this.files.get(path) ?? null;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async list(folder: string): Promise<StoredFile[]> {
    const prefix = `${folder.replace(/\/$/, '')}/`;
    const children = new Map<string, StoredFile>();
    for (const [path, data] of this.files) {
      if (!path.startsWith(prefix)) continue;
      const [name, ...rest] = path.slice(prefix.length).split('/');
      children.set(name, { path: `${prefix}${name}`, size: rest.length ? 0 : data.length, isDirectory: rest.length > 0, checksum: rest.length ? null : sha256(data) });
    }
    return [...children.values()];
  }

  async delete(path: string): Promise<void> {
    this.deletes.push(path);
    for (const file of [...this.files.keys()]) {
      if (path.endsWith('/') ? file.startsWith(path) : file === path) this.files.delete(file);
    }
  }

  json(path: string): unknown {
    const data = this.files.get(path);
    return data ? JSON.parse(data.toString('utf8')) : undefined;
  }
}
