import fs from 'fs';
import path from 'path';
import { CONTENT_DIR } from '../config';
import type { BookData } from '../../../shared/types/game-config';
import { passProblems } from '../../../shared/types/passes';
import { environmentProblems } from '../../../shared/types/environment';
import { buildErrors } from '../lib/errors';
import { readYaml, validate } from '../lib/content';

export function buildBook(): BookData {
  const file = path.join(CONTENT_DIR, 'book.yaml');
  if (!fs.existsSync(file)) {
    buildErrors.push('book.yaml is missing');
    return { id: '', title: '', author: '' };
  }
  const book = validate<BookData>(readYaml(file), 'book', 'book.yaml');
  if (book?.passes !== undefined) passProblems(book.passes, 'passes').forEach(problem => buildErrors.push(`book.yaml: ${problem}`));
  if (book?.environment !== undefined) environmentProblems(book.environment).forEach(problem => buildErrors.push(`book.yaml: ${problem}`));
  return book ?? { id: '', title: '', author: '' };
}
