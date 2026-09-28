import type { BookData, StepData } from '../../../shared/types/game-config';
import { buildErrors } from '../lib/errors';
import { readSection, validate } from '../lib/content';

/** Book fields usable in step texts as {{name}} (filled in by the app from book.yaml) */
export const BOOK_PLACEHOLDERS = ['title', 'author', 'publisher'] as const;

export function buildTutorial(book: BookData): StepData[] {
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
