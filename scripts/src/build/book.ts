import fs from 'fs';
import path from 'path';
import { CONTENT_DIR } from '../config';
import type { BookData } from '../../../shared/types/game-config';
import { passProblems } from '../../../shared/types/passes';
import { environmentProblems } from '../../../shared/types/environment';
import { buildErrors } from '../lib/errors';
import { readYaml, validate } from '../lib/content';

/**
 * The environment's asset references (content schema 2.9) as the configuration holds them: a path below the content
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

export function buildBook(): BookData {
  const file = path.join(CONTENT_DIR, 'book.yaml');
  if (!fs.existsSync(file)) {
    buildErrors.push('book.yaml is missing');
    return { id: '', title: '', author: '' };
  }
  const book = validate<BookData>(readYaml(file), 'book', 'book.yaml');
  if (book?.passes !== undefined) passProblems(book.passes, 'passes').forEach(problem => buildErrors.push(`book.yaml: ${problem}`));
  if (book?.environment !== undefined) {
    const { environment, problems } = resolveEnvironment(book.environment);
    book.environment = environment as BookData['environment'];
    [...problems, ...(problems.length ? [] : environmentProblems(environment))].forEach(problem => buildErrors.push(`book.yaml: ${problem}`));
  }
  return book ?? { id: '', title: '', author: '' };
}
