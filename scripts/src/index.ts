import { createHash } from 'crypto';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import {
  projectRoot,
  CONTENT_DIR,
  OUTPUT_FILE,
  MINDAR_DIR,
  CLIENT_PUBLIC_ASSETS_DIR,
  SCRIPTS_SRC_DIR,
  MAX_TARGETS_PER_SPREAD,
  APP_VERSION
} from './config';
import { validateContent } from './utils/validation';
import { assertGameConfiguration, GameConfigurationError } from '../../shared/guards/game-config';
import { FilterData, filterProblems } from '../../shared/types/filters';
import type {
  AssetData,
  AssetType,
  BookData,
  EntityData,
  EntityRefData,
  EntryData,
  GameConfiguration,
  SpreadData,
  StepData,
  TargetData
} from '../../shared/types/game-config';

/**
 * OSCT content build: `content/` (YAML + media) → `client/src/game.config.json`
 * (+ copy of `content/` in `client/public/assets/content`, target images in `mind-ar/`).
 *
 * Source layout (folder name = id):
 *   content/book.yaml
 *   content/spreads/<id>/spread.yaml   title, order, firstPage, lastPage, mind
 *   content/entries/<id>/entry.yaml    category, title, page, body, …, target? { image, order?, id?, entity? }
 *   content/entities/<id>/entity.yaml  type, assets[{ id?, src }], params   (referenced as entity: { ref })
 *   content/steps/<id>/step.yaml       tutorial
 */

// Text files get normalised line endings before hashing
const TEXT_FILE = /\.(ya?ml|json|ts|js|md|txt|html|css)$/i;

const ASSET_TYPE_BY_EXTENSION: Record<string, AssetType> = {
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

// Content errors collected during the build. Any error fails the build before files are written.
const buildErrors: string[] = [];

interface SourceItem {
  id: string; // folder name
  file: string;
  data: Record<string, any>;
}

console.log('🚀 OSCT Content Build Tool 🚀');
console.log('----------------------------');
console.log('📁 Project root:', projectRoot);
console.log('📁 Content directory:', CONTENT_DIR);
console.log('📄 Output file:', OUTPUT_FILE);

/**
 * Recursively delete a directory
 */
function deleteFolderRecursive(folderPath: string): void {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
}

/**
 * Recursively copy a directory
 * @returns Number of files copied
 */
function copyFolderRecursive(source: string, target: string): number {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  let fileCount = 0;
  for (const file of fs.readdirSync(source)) {
    const sourcePath = path.join(source, file);
    const targetPath = path.join(target, file);
    if (fs.statSync(sourcePath).isDirectory()) {
      fileCount += copyFolderRecursive(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
      fileCount++;
    }
  }
  return fileCount;
}

/**
 * Copy the content directory to the client's public assets directory
 */
function copyContentToPublic(): void {
  console.log(`\n📦 Copying content to client public assets directory...`);
  if (fs.existsSync(CLIENT_PUBLIC_ASSETS_DIR)) {
    console.log(`🧹 Cleaning client public assets directory: ${CLIENT_PUBLIC_ASSETS_DIR}`);
    deleteFolderRecursive(CLIENT_PUBLIC_ASSETS_DIR);
  }
  fs.mkdirSync(CLIENT_PUBLIC_ASSETS_DIR, { recursive: true });
  const fileCount = copyFolderRecursive(CONTENT_DIR, CLIENT_PUBLIC_ASSETS_DIR);
  console.log(`✅ ${fileCount} content files successfully copied to: ${CLIENT_PUBLIC_ASSETS_DIR}`);
}

/**
 * Read a YAML file; records an error and returns null if it can't be read
 */
function readYaml(file: string): Record<string, any> | null {
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
function readSection(section: string, fileName: string): SourceItem[] {
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
function validate<T>(data: unknown, type: string, label: string): T | null {
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
function contentFile(section: string, id: string, file: string, label: string): string {
  if (!fs.existsSync(path.join(CONTENT_DIR, section, id, file))) {
    buildErrors.push(`${label}: file "${file}" not found in content/${section}/${id}/`);
  }
  return `/assets/content/${section}/${id}/${file}`;
}

function assetType(file: string, label: string): AssetType {
  const type = ASSET_TYPE_BY_EXTENSION[path.extname(file).toLowerCase()];
  if (!type) buildErrors.push(`${label}: unsupported file type "${file}"`);
  return type ?? 'image';
}

function buildBook(): BookData {
  const file = path.join(CONTENT_DIR, 'book.yaml');
  if (!fs.existsSync(file)) {
    buildErrors.push('book.yaml is missing');
    return { id: '', title: '', author: '' };
  }
  const book = validate<BookData>(readYaml(file), 'book', 'book.yaml');
  return book ?? { id: '', title: '', author: '' };
}

function buildSpreads(): SpreadData[] {
  const spreads = readSection('spreads', 'spread.yaml')
    .map(({ id, data }) => {
      const label = `spreads/${id}`;
      const s = validate<any>(data, 'spread', label);
      if (!s) return null;
      if (s.firstPage > s.lastPage) buildErrors.push(`${label}: firstPage ${s.firstPage} > lastPage ${s.lastPage}`);
      return {
        order: s.order as number,
        spread: {
          id,
          title: s.title,
          firstPage: s.firstPage,
          lastPage: s.lastPage,
          mindSrc: contentFile('spreads', id, s.mind, label),
        } satisfies SpreadData,
      };
    })
    .filter((item): item is { order: number; spread: SpreadData } => item !== null)
    .sort((a, b) => a.order - b.order || a.spread.id.localeCompare(b.spread.id))
    .map(({ spread }) => spread);

  // A page belongs to at most one spread
  spreads.forEach((a, i) => spreads.slice(i + 1).forEach(b => {
    if (a.firstPage <= b.lastPage && b.firstPage <= a.lastPage) {
      buildErrors.push(`spreads/${a.id} and spreads/${b.id}: page ranges overlap`);
    }
  }));
  return spreads;
}

function buildEntities(): Record<string, EntityData> {
  const entities: Record<string, EntityData> = {};
  for (const { id, data } of readSection('entities', 'entity.yaml')) {
    const label = `entities/${id}`;
    const e = validate<any>(data, 'entity', label);
    if (!e) continue;
    const assets: AssetData[] = (e.assets as any[]).map((asset, i) => {
      if (!asset || typeof asset.src !== 'string') {
        buildErrors.push(`${label}: assets[${i}] needs a src`);
        return null;
      }
      return {
        id: `${id}-${asset.id ?? i}`,
        assetType: assetType(asset.src, label),
        src: contentFile('entities', id, asset.src, label),
      };
    }).filter((asset): asset is AssetData => asset !== null);
    if (assets.length === 0) buildErrors.push(`${label}: type "${e.type}" needs assets`);
    const filters = buildFilters(e.filters, e.type, label);
    entities[id] = { type: e.type, assets, ...(e.params ? { params: e.params } : {}), ...(filters ? { filters } : {}) };
  }
  return entities;
}

/**
 * Video filters `[{ type, ...parameters }]` – checked against their definitions in shared/types/filters.ts
 */
function buildFilters(raw: unknown, type: string, label: string): FilterData[] | undefined {
  if (raw === undefined) return undefined;
  if (type !== 'video') {
    buildErrors.push(`${label}: filters only work on video entities (type is "${type}")`);
    return undefined;
  }
  const problems = filterProblems(raw, 'filters');
  problems.forEach(problem => buildErrors.push(`${label}: ${problem}`));
  return problems.length ? undefined : (raw as FilterData[]);
}

/**
 * Inline entity `{ type, src?, params?, filters? }` or reference `{ ref }`
 */
function buildEntity(
  raw: unknown,
  entryId: string,
  targetId: string,
  entities: Record<string, EntityData>,
  label: string
): EntityData | EntityRefData | undefined {
  if (raw === undefined) return undefined;
  const e = raw as Record<string, any>;
  if (typeof e?.ref === 'string') {
    if (!(e.ref in entities)) buildErrors.push(`${label}: entity ref "${e.ref}" not found in content/entities/`);
    return { ref: e.ref };
  }
  const type = e?.type;
  // "link" was dropped on 2026-09-25: links are entries (consultation), not AR entities
  if (!['model', 'video', 'image'].includes(type)) {
    buildErrors.push(`${label}: entity type "${type}" must be one of model, video, image (or use ref)`);
    return undefined;
  }
  if (e.params !== undefined && (typeof e.params !== 'object' || Array.isArray(e.params))) {
    buildErrors.push(`${label}: entity params must be a mapping`);
  }
  if (typeof e.src !== 'string') {
    buildErrors.push(`${label}: entity type "${type}" needs a src`);
    return undefined;
  }
  const filters = buildFilters(e.filters, type, label);
  return {
    type,
    assets: [{
      id: `${targetId}-media`,
      assetType: assetType(e.src, label),
      src: contentFile('entries', entryId, e.src, label),
    }],
    ...(e.params ? { params: e.params } : {}),
    ...(filters ? { filters } : {}),
  };
}

interface EntryBuild {
  entry: EntryData;
  spreadId: string | null;
  targetOrder: number;
  imageFile?: string; // source path of the target image (for mind-ar/)
}

function buildEntries(spreads: SpreadData[], entities: Record<string, EntityData>): EntryBuild[] {
  const builds: EntryBuild[] = [];
  for (const { id, data } of readSection('entries', 'entry.yaml')) {
    const label = `entries/${id}`;
    const e = validate<any>(data, 'entry', label);
    if (!e) continue;

    // The access page decides the spread
    const spread = spreads.find(s => e.page >= s.firstPage && e.page <= s.lastPage);
    if (!spread) buildErrors.push(`${label}: page ${e.page} is not part of any spread`);

    const entry: EntryData = {
      id,
      category: e.category,
      title: e.title,
      page: e.page,
      body: e.body,
      tags: e.tags,
      ...(e.author ? { author: e.author } : {}),
      ...(e.image ? { image: contentFile('entries', id, e.image, label) } : {}),
      ...(e.media ? { media: e.media } : {}),
    };

    let targetOrder = 0;
    let imageFile: string | undefined;
    if (e.target !== undefined) {
      const t = validate<any>(e.target, 'target', `${label} target`);
      if (t) {
        const targetId: string = t.id ?? id;
        targetOrder = t.order;
        imageFile = path.join(CONTENT_DIR, 'entries', id, t.image);
        const target: TargetData = {
          id: targetId,
          index: -1, // assigned per spread below
          imageSrc: contentFile('entries', id, t.image, `${label} target`),
        };
        const entity = buildEntity(t.entity, id, targetId, entities, `${label} target`);
        if (entity) target.entity = entity;
        entry.target = target;
      }
    }

    builds.push({ entry, spreadId: spread?.id ?? null, targetOrder, imageFile });
  }
  return builds;
}

/**
 * Assign MindAR indices per spread (page → target order → id; must match the compiled .mind)
 * and copy the target images to `mind-ar/<spread>/<index>-<file>` for compiling.
 */
function assignTargetIndices(spreads: SpreadData[], builds: EntryBuild[]): void {
  if (fs.existsSync(MINDAR_DIR)) deleteFolderRecursive(MINDAR_DIR);
  fs.mkdirSync(MINDAR_DIR, { recursive: true });

  for (const spread of spreads) {
    const targets = builds
      .filter(b => b.spreadId === spread.id && b.entry.target)
      .sort((a, b) => a.entry.page - b.entry.page || a.targetOrder - b.targetOrder || a.entry.id.localeCompare(b.entry.id));

    if (targets.length > MAX_TARGETS_PER_SPREAD) {
      buildErrors.push(`spreads/${spread.id} has ${targets.length} targets, max is ${MAX_TARGETS_PER_SPREAD}.`);
    }

    const spreadDir = path.join(MINDAR_DIR, spread.id);
    fs.mkdirSync(spreadDir, { recursive: true });
    targets.forEach((b, index) => {
      b.entry.target!.index = index;
      if (b.imageFile && fs.existsSync(b.imageFile)) {
        fs.copyFileSync(b.imageFile, path.join(spreadDir, `${index}-${path.basename(b.imageFile)}`));
      }
      console.log(`🎯 ${spread.id}[${index}] ${b.entry.target!.id} (page ${b.entry.page})`);
    });
  }
}

/** Book fields usable in step texts as {{name}} (filled in by the app from book.yaml) */
const BOOK_PLACEHOLDERS = ['title', 'author', 'publisher'] as const;

function buildTutorial(book: BookData): StepData[] {
  return readSection('steps', 'step.yaml')
    .map(({ id, data }) => {
      const s = validate<any>(data, 'step', `steps/${id}`);
      if (!s) return null;
      for (const field of ['title', 'description', 'footer'] as const) {
        for (const [, name] of String(s[field] ?? '').matchAll(/\{\{(\w+)\}\}/g)) {
          if (!(BOOK_PLACEHOLDERS as readonly string[]).includes(name)) {
            buildErrors.push(`steps/${id}: ${field} uses {{${name}}} – allowed: ${BOOK_PLACEHOLDERS.map(p => `{{${p}}}`).join(', ')}`);
          } else if (!book[name as keyof BookData]) {
            buildErrors.push(`steps/${id}: ${field} uses {{${name}}}, but book.yaml has no ${name}`);
          }
        }
      }
      // Optional fields only when set (the bundle stays free of empty keys)
      const optional = Object.fromEntries(
        (['title', 'description', 'footer', 'illustration', 'button', 'action', 'fadeIn', 'stagger', 'advance'] as const)
          .filter(key => s[key] !== undefined && s[key] !== '')
          .map(key => [key, s[key]])
      );
      return { id, index: s.index, ...optional } satisfies StepData;
    })
    .filter((step): step is StepData => step !== null)
    .sort((a, b) => a.index - b.index);
}

/**
 * Build the final config object
 */
function buildConfig(versionStr: string, inputHash: string): GameConfiguration {
  const book = buildBook();
  const spreads = buildSpreads();
  const entities = buildEntities();
  const builds = buildEntries(spreads, entities);
  assignTargetIndices(spreads, builds);
  const tutorial = buildTutorial(book);

  const entries = builds
    .map(b => b.entry)
    .sort((a, b) => a.page - b.page || (a.target?.index ?? 99) - (b.target?.index ?? 99) || a.title.localeCompare(b.title));

  console.log(`✨ ${spreads.length} spreads, ${entries.length} entries (${entries.filter(e => e.target).length} with target), ${Object.keys(entities).length} shared entities, ${tutorial.length} steps`);

  const timestamp = new Date().toISOString();
  console.log(`📊 Building config version: ${versionStr} (${timestamp}, hash ${inputHash.slice(0, 12)})`);

  const config: GameConfiguration = {
    version: {
      version: versionStr,
      timestamp, // when the build inputs last changed
      hash: inputHash
    },
    book,
    maxTargetsPerSpread: MAX_TARGETS_PER_SPREAD,
    initialSpreadId: spreads[0]?.id ?? '',
    spreads,
    entries,
    entities,
    tutorial,
  };

  // The same contract check the app runs on load
  try {
    assertGameConfiguration(config);
  } catch (error) {
    if (error instanceof GameConfigurationError) buildErrors.push(...error.problems.map(p => `output ${p}`));
    else throw error;
  }

  if (buildErrors.length > 0) {
    throw new Error(`${buildErrors.length} content error(s):\n  - ${buildErrors.join('\n  - ')}`);
  }

  copyContentToPublic();
  return config;
}

/**
 * List all files below a directory (sorted, relative paths with forward slashes)
 */
function listFiles(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(dirent => {
      const fullPath = path.join(dir, dirent.name);
      return dirent.isDirectory() ? listFiles(fullPath, base) : [path.relative(base, fullPath).split(path.sep).join('/')];
    })
    .sort();
}

/**
 * Checksum of everything that determines the build output: content files, the build logic,
 * the shared contract and the package version. Line endings of text files are normalised so
 * Windows and Unix checkouts produce the same hash.
 */
function hashBuildInputs(version: string): string {
  const hash = createHash('sha256');
  hash.update(`version:${version}\n`);
  const sharedDir = path.join(projectRoot, 'shared');
  for (const [label, dir] of [['content', CONTENT_DIR], ['scripts', SCRIPTS_SRC_DIR], ['shared', sharedDir]] as const) {
    for (const file of listFiles(dir)) {
      let data = fs.readFileSync(path.join(dir, file));
      if (TEXT_FILE.test(file)) {
        data = Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
      }
      hash.update(`${label}/${file}\n`);
      hash.update(data);
    }
  }
  return hash.digest('hex');
}

/**
 * Hash stored in the current output file, if any
 */
function readPreviousHash(): string | null {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')).version?.hash ?? null;
  } catch {
    return null;
  }
}

/**
 * Main function to generate the config file
 */
function generateConfigFile(): void {
  try {
    // Skip the build (and keep the timestamp) when nothing that affects the output changed
    const versionStr = APP_VERSION;
    const inputHash = hashBuildInputs(versionStr);
    const force = process.argv.includes('--force');
    if (!force && inputHash === readPreviousHash() && fs.existsSync(CLIENT_PUBLIC_ASSETS_DIR)) {
      console.log(`✅ Content unchanged (hash ${inputHash.slice(0, 12)}), nothing to build. Use --force to rebuild.`);
      return;
    }

    const config = buildConfig(versionStr, inputHash);

    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(config, null, 2));
    console.log(`🎉 Successfully generated ${OUTPUT_FILE} (version: ${config.version.version})`);
  } catch (error) {
    console.error('❌ Error generating config file:', error);
    process.exit(1);
  }
}

console.log('\n🔄 Starting content build process...');
generateConfigFile();
