import { verifiedRepair } from '../../../shared/plugins/repairs';
import type { PluginSources, PluginTypeProblem } from '../../../shared/plugins/type-check';
import type { PluginFilesApi } from './plugin-files-api';

/**
 * `osct plugins check` (#366): every stored plugin of an instance's experiences type-checked with the publish's own check
 * (`plugin-type-check.ts`), what fails as a table, and – only with `repair` – the known faults (`shared/plugins/repairs.ts`)
 * repaired through the editor API: a normal save each (a change in History, by the token's owner), checked again.
 * Without `repair` nothing is written.
 */

/** One row of the table: a type error, and whether a known repair applies (`repairable`) or was saved (`repaired`) */
export interface CheckRow {
  experience: string;
  plugin: string;
  file: string;
  line: number;
  message: string;
  repair: '' | 'repairable' | 'repaired';
}

export interface PluginsCheck {
  rows: CheckRow[];
  /** Plugins checked */
  checked: number;
  /** Plugins that still fail */
  failing: number;
  /** The repairs saved: the plugin and the fault */
  repaired: Array<{ experience: string; plugin: string; fault: string }>;
}

export interface CheckOptions {
  /** Save the known repairs (`--repair`) */
  repair: boolean;
  check: (sources: readonly PluginSources[]) => PluginTypeProblem[];
  log?: (line: string) => void;
}

/** Type-check every stored plugin of the experiences, one experience at a time (its plugins together, as its publish) */
export async function checkStoredPlugins(api: PluginFilesApi, experiences: readonly string[], options: CheckOptions): Promise<PluginsCheck> {
  const result: PluginsCheck = { rows: [], checked: 0, failing: 0, repaired: [] };
  const rowsOf = (experience: string, problems: readonly PluginTypeProblem[], repair: CheckRow['repair']): CheckRow[] =>
    problems.map(p => ({ experience, plugin: p.plugin, file: p.file, line: p.line, message: p.message, repair }));
  for (const experience of experiences) {
    const ids = await api.plugins(experience);
    const sources: PluginSources[] = [];
    for (const id of ids) sources.push({ id, files: (await api.get(experience, id)).files });
    result.checked += sources.length;
    const problems = sources.length ? options.check(sources) : [];
    for (const source of sources) {
      const own = problems.filter(p => p.plugin === source.id);
      if (!own.length) continue;
      const repair = await verifiedRepair(source, own, options.check);
      if (!repair || !options.repair) {
        result.failing += 1;
        result.rows.push(...rowsOf(experience, own, repair ? 'repairable' : ''));
        continue;
      }
      // A normal save of every file (one left out would be gone); a link to a folder stays
      await api.put(experience, source.id, repair.files);
      result.repaired.push({ experience, plugin: source.id, fault: repair.fault.id });
      options.log?.(`🔧 ${experience} · ${source.id}: ${repair.fault.title} – repaired (${repair.changed.join(', ')})`);
      const after = options.check([{ id: source.id, files: (await api.get(experience, source.id)).files }]);
      result.rows.push(...rowsOf(experience, own.filter(p => repair.changed.includes(p.file) && p.message.includes(repair.fault.message)), 'repaired'));
      if (after.length) {
        result.failing += 1;
        result.rows.push(...rowsOf(experience, after, ''));
      }
    }
  }
  return result;
}

/** The rows as a table: experience, plugin, file, line, repair, message (the message last – it is the long one) */
export function checkTable(rows: readonly CheckRow[]): string[] {
  if (!rows.length) return [];
  const head: Array<[string, string, string, string, string, string]> = [['experience', 'plugin', 'file', 'line', 'repair', 'message']];
  const cells = head.concat(rows.map(r => [r.experience, r.plugin, r.file, String(r.line), r.repair, r.message]));
  const widths = [0, 1, 2, 3, 4].map(i => Math.max(...cells.map(c => c[i].length)));
  return cells.map(c => [...c.slice(0, 5).map((cell, i) => cell.padEnd(widths[i])), c[5]].join('  ').trimEnd());
}
