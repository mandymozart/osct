import fs from 'fs';
import path from 'path';
import { CONTENT_DIR } from '../config';
import type { BookData, ExperienceData } from '../../../shared/types/game-config';
import { passBudgetWarning, passProblems, type PassData, type PassSpec } from '../../../shared/types/passes';
import { appearanceProblems, type AppearanceSpec, type ExperienceAppearance } from '../../../shared/types/appearance';
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
 * A `passes` list of the experience or a scene, checked against the specs: the built-in passes and – schema 2.21 – the
 * plugins' passes the build recorded (`pluginPasses`, type → spec); a list beyond the phone budget is a warning
 */
export function checkedPasses(passes: unknown, label: string, pluginPasses: ReadonlyMap<string, PassSpec> = new Map()): PassData[] {
  const problems = passProblems(passes, 'passes', { spec: type => pluginPasses.get(type), pluginTypes: [...pluginPasses.keys()] });
  const checked = contractPart<PassData[]>(passes, problems, label);
  const budget = !problems.length && Array.isArray(passes) ? passBudgetWarning(checked) : null;
  if (budget) buildWarnings.push(`${label}: ${budget}`);
  return checked;
}

/**
 * The experience's `appearance` (schema 2.29): a look per moment, checked against the built-in looks and the looks the
 * plugins recorded (`pluginAppearances`, type → spec)
 */
export function checkedAppearance(appearance: unknown, label: string, pluginAppearances: ReadonlyMap<string, AppearanceSpec> = new Map()): ExperienceAppearance {
  const problems = appearanceProblems(appearance, 'appearance', { spec: type => pluginAppearances.get(type), pluginTypes: [...pluginAppearances.keys()] });
  return contractPart<ExperienceAppearance>(appearance, problems, label);
}

/** The print data that lives in `book:` – on the top level of experience.yaml it is an error */
const PRINT_FIELDS = ['author', 'publisher'] as const;
const GONE = 'sourceOfTruth is gone – every experience adds and removes its scenes (`npm run convert:4` drops it)';

/**
 * The experience (content/experience.yaml): id, title, passes, environment, appearance – and the printed book it
 * accompanies (`book:`, optional: author, publisher)
 */
export function buildExperience(pluginPasses: ReadonlyMap<string, PassSpec> = new Map(), pluginAppearances: ReadonlyMap<string, AppearanceSpec> = new Map()): ExperienceData {
  const label = 'experience.yaml';
  const file = path.join(CONTENT_DIR, label);
  if (!fs.existsSync(file)) {
    buildErrors.push(fs.existsSync(path.join(CONTENT_DIR, 'book.yaml'))
      ? 'experience.yaml is missing – this content is older than schema 4.0 (book.yaml): convert it with `npm run convert:4`'
      : 'experience.yaml is missing');
    return { id: '', title: '' };
  }
  const experience = validate(readYaml(file), 'experience', label);
  if (!experience) return { id: '', title: '' };
  const { passes, environment, appearance, book, ...fields } = experience;
  PRINT_FIELDS.filter(key => fields[key] !== undefined)
    .forEach(key => buildErrors.push(`${label}: ${key} belongs to the printed book – write it under book:`));
  if (fields.sourceOfTruth !== undefined) buildErrors.push(`${label}: ${GONE}`);
  const result: ExperienceData = { ...fields, id: experience.id, title: experience.title };
  if (book !== undefined) {
    const printed = validate(book, 'book', `${label} book`);
    if (printed?.sourceOfTruth !== undefined) buildErrors.push(`${label}: book.${GONE}`);
    else if (printed) result.book = printed as BookData;
  }
  if (passes !== undefined) result.passes = checkedPasses(passes, label, pluginPasses);
  if (appearance !== undefined) result.appearance = checkedAppearance(appearance, label, pluginAppearances);
  if (environment !== undefined) {
    const resolved = resolveEnvironment(environment);
    const problems = resolved.problems.length ? resolved.problems : environmentProblems(resolved.environment);
    result.environment = contractPart<EnvironmentData>(resolved.environment, problems, label);
  }
  return result;
}
