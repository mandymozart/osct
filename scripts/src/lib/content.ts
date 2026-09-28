// Reading content/: YAML files, sections (one folder per item), file references
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { CONTENT_DIR } from '../config';
import type { AssetType } from '../../../shared/types/game-config';
import { buildErrors } from './errors';
import { validateContent } from './validation';

export const ASSET_TYPE_BY_EXTENSION: Record<string, AssetType> = {
  '.glb': 'glb',
  '.gltf': 'gltf',
  '.mp4': 'video',
  '.webm': 'video',
  '.mov': 'video',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.webp': 'image',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
};

export interface SourceItem {
  id: string; // folder name
  file: string;
  data: Record<string, any>;
}

/**
 * Read a YAML file; records an error and returns null if it can't be read
 */
export function readYaml(file: string): Record<string, any> | null {
  try {
    const data = yaml.load(fs.readFileSync(file, 'utf8'));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, any>;
    buildErrors.push(`${path.relative(CONTENT_DIR, file)}: expected a YAML mapping`);
  } catch (error) {
    buildErrors.push(`${path.relative(CONTENT_DIR, file)}: ${(error as Error).message}`);
  }
  return null;
}

/**
 * Read `content/<section>/<id>/<fileName>` for every folder in a section
 */
export function readSection(section: string, fileName: string): SourceItem[] {
  const dir = path.join(CONTENT_DIR, section);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => ({ id: dirent.name, file: path.join(dir, dirent.name, fileName) }))
    .filter(({ id, file }) => {
      if (fs.existsSync(file)) return true;
      buildErrors.push(`${section}/${id}: missing ${fileName}`);
      return false;
    })
    .map(({ id, file }) => ({ id, file, data: readYaml(file) }))
    .filter((item): item is SourceItem => item.data !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Validate against the authoring schema; records an error and returns null if invalid
 */
export function validate<T>(data: unknown, type: string, label: string): T | null {
  try {
    return validateContent(data, type) as T;
  } catch (error) {
    buildErrors.push(`${label}: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Public URL of a file next to a source file, after an existence check
 */
export function contentFile(section: string, id: string, file: string, label: string): string {
  if (!fs.existsSync(path.join(CONTENT_DIR, section, id, file))) {
    buildErrors.push(`${label}: file "${file}" not found in content/${section}/${id}/`);
  }
  return `/assets/content/${section}/${id}/${file}`;
}

export function assetType(file: string, label: string): AssetType {
  const type = ASSET_TYPE_BY_EXTENSION[path.extname(file).toLowerCase()];
  if (!type) buildErrors.push(`${label}: unsupported file type "${file}"`);
  return type ?? 'image';
}
