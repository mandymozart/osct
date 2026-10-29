/**
 * Trigger protocol data for the debug trial panel (`client/src/components/dev-tools/trial-panel.ts`): what the
 * delivery mapping knows about every target's printed image – the delivered file, its size in mm and position
 * on the page, and the editors' note – keyed by target id.
 * `node dist/protocol.js <mapping.yaml> [output.json]` (`npm run protocol -- import/<name>.yaml`).
 * Default output: `client/public/trigger-protocol.json`, served at `/trigger-protocol.json`; the panel works
 * without it, then without the printed-image details.
 */
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { CONTENT_DIR, projectRoot } from './config';
import { isMainModule } from './lib/entry';
import { readMapping } from './import-delivery';
// The engine reads the file (the trial panel): one definition of its shape
import type { TriggerInfo, TriggerInfos } from '../../engine/src/utils/trigger-protocol';

export const DEFAULT_OUTPUT = path.resolve(projectRoot, 'client/public/trigger-protocol.json');

/** Per target id (the entry id unless `target.id` overrides it) of every entry in `content/` with a target */
export function protocolInfos(mappingFile: string): TriggerInfos {
  const mapping = readMapping(mappingFile);
  const dir = path.join(CONTENT_DIR, 'entries');
  const infos: TriggerInfos = {};
  for (const id of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
    const file = path.join(dir, id, 'entry.yaml');
    if (!fs.existsSync(file)) continue;
    const e: unknown = yaml.load(fs.readFileSync(file, 'utf8'));
    const target = typeof e === 'object' && e !== null && 'target' in e ? e.target : undefined;
    const mapped = mapping.entries[id];
    if (!target || !mapped) continue;
    const info: TriggerInfo = {};
    if (mapped.target) info.source = path.basename(mapped.target);
    if (mapped.printed) Object.assign(info, mapped.printed);
    if (mapped.note) info.note = mapped.note;
    const targetId = typeof target === 'object' && 'id' in target && typeof target.id === 'string' ? target.id : id;
    infos[targetId] = info;
  }
  return infos;
}

if (isMainModule(import.meta.url)) {
  const [mappingFile, output = DEFAULT_OUTPUT] = process.argv.slice(2);
  if (!mappingFile) {
    console.error('Usage: node dist/protocol.js <mapping.yaml> [output.json]');
    process.exit(2);
  }
  const infos = protocolInfos(path.resolve(mappingFile));
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(path.resolve(output), JSON.stringify(infos, null, 1) + '\n');
  console.log(`📋 ${Object.keys(infos).length} targets → ${path.resolve(output)}`);
}
