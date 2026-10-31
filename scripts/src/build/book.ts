import fs from 'fs';
import path from 'path';
import { CONTENT_DIR } from '../config';
import type { BookData } from '../../../shared/types/game-config';
import { passBudgetWarning, passProblems, type PassData, type PassSpec } from '../../../shared/types/passes';
import { environmentProblems, type EnvironmentData } from '../../../shared/types/environment';
import { buildErrors, buildWarnings } from '../lib/errors';
import { contractPart, readYaml, validate } from '../lib/content';

/**
 * The environment's asset references (content schema 2.10) as the configuration holds them: a path below the content
 * folder (`environment/sky.jpg`) must exist and becomes its content path (`/assets/content/environment/sky.jpg` – the
 * build copies the whole folder); an absolute URL (an uploaded asset) stays as it is.
 */
export function resolveEnvironment(environment: unknown, contentDir = CONTENT_DIR): { environment: unknown; problems: string[] } {
  if (typeof environment !== 'object' || environment === null || Array.isArray(environment)) return { environment, problems: [] };
  const resolved: Record<string, unknown> = { ...(environment as Record<string, unknown>) };
  const problems: string[] = [];
  for (const key of ['worldSrc', 'skySrc']) {
    const value = resolved[key];
    if (typeof value !== 'string' || value === '' || /^https?:\/\//.test(value)) continue;
    const relative = value.replace(/^\/assets\/content\//, '').replace(/^\.?\//, '');
    if (relative.split('/').includes('..') || !fs.existsSync(path.join(contentDir, relative))) {
      problems.push(`environment.${key}: file "${value}" not found in the content folder`);
      continue;
    }
    resolved[key] = `/assets/content/${relative}`;
  }
  return { environment: resolved, problems };
}

/**
 * A `passes` list of the book or a spread, checked against the specs: the built-in passes and – schema 2.21 – the
 * plugins' passes the build recorded (`pluginPasses`, type → spec); a list beyond the phone budget is a warning
 */
export function checkedPasses(passes: unknown, label: string, pluginPasses: ReadonlyMap<string, PassSpec> = new Map()): PassData[] {
  const problems = passProblems(passes, 'passes', { spec: type => pluginPasses.get(type), pluginTypes: [...pluginPasses.keys()] });
  const checked = contractPart<PassData[]>(passes, problems, label);
  const budget = !problems.length && Array.isArray(passes) ? passBudgetWarning(checked) : null;
  if (budget) buildWarnings.push(`${label}: ${budget}`);
  return checked;
}

export function buildBook(pluginPasses: ReadonlyMap<string, PassSpec> = new Map()): BookData {
  const file = path.join(CONTENT_DIR, 'book.yaml');
  if (!fs.existsSync(file)) {
    buildErrors.push('book.yaml is missing');
    return { id: '', title: '', author: '' };
  }
  const book = validate(readYaml(file), 'book', 'book.yaml');
  if (!book) return { id: '', title: '', author: '' };
  const { passes, environment, ...fields } = book;
  const result: BookData = { ...fields, id: book.id, title: book.title, author: book.author };
  if (passes !== undefined) result.passes = checkedPasses(passes, 'book.yaml', pluginPasses);
  if (environment !== undefined) {
    const resolved = resolveEnvironment(environment);
    const problems = resolved.problems.length ? resolved.problems : environmentProblems(resolved.environment);
    result.environment = contractPart<EnvironmentData>(resolved.environment, problems, 'book.yaml');
  }
  return result;
}
