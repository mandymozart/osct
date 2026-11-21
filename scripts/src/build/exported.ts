import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { GameConfiguration, GroupData, SceneData } from '../../../shared/types/game-config';
import { CONTENT_DIR } from '../config';
import { buildErrors, messageOf } from '../lib/errors';

/**
 * What an export (`osct content export`, docs/content.md "Export") writes from the database besides the entries and scenes:
 * the scene groups (`groups.yaml`) and the Library's credit lines of the exported files (`credits.yaml`). A hand-written
 * content source has neither – both are optional.
 */
const GROUPS_FILE = 'groups.yaml';
const CREDITS_FILE = 'credits.yaml';

function readOptional(name: string): unknown {
  const file = path.join(CONTENT_DIR, name);
  if (!fs.existsSync(file)) return undefined;
  try {
    return yaml.load(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    buildErrors.push(`${name}: ${messageOf(error)}`);
    return undefined;
  }
}

/** groups.yaml: `[{ id, label }]` – the groups the scenes name (`group:` in scene.yaml); a scene naming none of them is an error */
export function buildGroups(scenes: readonly SceneData[]): GroupData[] {
  const raw = readOptional(GROUPS_FILE);
  const groups: GroupData[] = [];
  if (raw !== undefined) {
    if (!Array.isArray(raw)) buildErrors.push(`${GROUPS_FILE}: expected a list of { id, label }`);
    else raw.forEach((group: unknown, i) => {
      const g = group as Record<string, unknown> | null;
      if (!g || typeof g.id !== 'string' || !g.id || typeof g.label !== 'string') buildErrors.push(`${GROUPS_FILE}[${i}]: needs id and label`);
      else groups.push({ id: g.id, label: g.label });
    });
  }
  scenes.forEach(scene => {
    if (scene.group !== undefined && !groups.some(group => group.id === scene.group)) buildErrors.push(`scenes/${scene.id}: group "${scene.group}" is not in ${GROUPS_FILE}`);
  });
  return groups;
}

/**
 * credits.yaml: file (below the content folder) → credit line. The configuration's `credits` holds the lines of the files
 * it names (by their content path), as the editor's draft does (#292)
 */
export function buildCredits(config: GameConfiguration): Record<string, string> {
  const raw = readOptional(CREDITS_FILE);
  if (raw === undefined) return {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    buildErrors.push(`${CREDITS_FILE}: expected file: credit line`);
    return {};
  }
  const named = new Set<string>();
  const walk = (node: unknown) => {
    if (typeof node === 'string') named.add(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(config);
  const credits: Record<string, string> = {};
  for (const [file, line] of Object.entries(raw)) {
    const contentPath = `/assets/content/${file.replace(/^\/assets\/content\//, '')}`;
    if (typeof line !== 'string' || !line.trim()) buildErrors.push(`${CREDITS_FILE}: "${file}" needs a credit line (text)`);
    else if (named.has(contentPath)) credits[contentPath] = line;
  }
  return credits;
}
