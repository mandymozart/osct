import fs from 'fs';
import path from 'path';
import { CONTENT_DIR } from '../config';
import type { BookData } from '../../../shared/types/game-config';
import { buildErrors } from '../lib/errors';
import { readYaml, validate } from '../lib/content';

export function buildBook(): BookData {
  const file = path.join(CONTENT_DIR, 'book.yaml');
  if (!fs.existsSync(file)) {
    buildErrors.push('book.yaml is missing');
    return { id: '', title: '', author: '' };
  }
  const book = validate<BookData>(readYaml(file), 'book', 'book.yaml');
  return book ?? { id: '', title: '', author: '' };
}
