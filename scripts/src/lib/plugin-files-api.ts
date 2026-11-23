import type { PluginFile } from '../../../shared/types/plugins';

/**
 * The editor API's plugin routes with a person's token (docs/server.md "Plugin sources"): what `osct plugins listen` and
 * `osct plugin push / pull` use (#352). A plugin is its files; `origin` links it to the folder a push comes from.
 */
export interface PluginFilesApi {
  experiences(): Promise<string[]>;
  plugins(experience: string): Promise<string[]>;
  /** A plugin's files (404: an Error whose message starts with `GET … → 404`) */
  get(experience: string, plugin: string): Promise<{ files: PluginFile[]; origin: { folder: string; by: string | null; at: string } | null }>;
  /** Every file of a plugin (one left out is gone); `origin` { folder } links it, null unlinks, absent keeps it */
  put(experience: string, plugin: string, files: PluginFile[], origin?: { folder: string } | null): Promise<void>;
}

export function pluginFilesApi(api: string, token: string, fetcher: typeof fetch = fetch): PluginFilesApi {
  const call = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const response = await fetcher(`${api}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
    if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${(await response.text().catch(() => '')).slice(0, 300)}`);
    return response.json();
  };
  const at = (experience: string, plugin?: string) =>
    `/editor/experiences/${encodeURIComponent(experience)}/plugins${plugin ? `/${encodeURIComponent(plugin)}` : ''}`;
  return {
    experiences: async () => ((await call('/editor/experiences')) as { experiences: { id: string }[] }).experiences.map(e => e.id),
    plugins: async experience => ((await call(at(experience))) as { plugins: { id: string }[] }).plugins.map(p => p.id),
    get: async (experience, plugin) => {
      const { plugin: row } = (await call(at(experience, plugin))) as { plugin: { files: PluginFile[]; origin: { folder: string; by: string | null; at: string } | null } };
      return { files: row.files, origin: row.origin ?? null };
    },
    put: async (experience, plugin, files, origin) => {
      await call(at(experience, plugin), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, ...(origin !== undefined ? { origin } : {}) }),
      });
    },
  };
}
