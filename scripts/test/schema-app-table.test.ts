import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTENT_SCHEMA_VERSION } from '../../shared/types/game-config';

// docs/content.md "Schema and app versions": one row per content schema, the current one last
const doc = readFileSync(new URL('../../docs/content.md', import.meta.url), 'utf8');
const section = doc.split('## Schema and app versions')[1]?.split('\n## ')[0] ?? '';
const rows = section
  .split('\n')
  .filter(line => /^\|\s*\d+\.\d+\s*\|/.test(line))
  .map(line => line.split('|').map(cell => cell.trim()).filter(Boolean));

describe('schema and app version table', () => {
  it('has a row per schema', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it('ends with the current CONTENT_SCHEMA_VERSION', () => {
    expect(rows.at(-1)?.[0]).toBe(CONTENT_SCHEMA_VERSION);
  });

  it('lists every schema once, in order', () => {
    const schemas = rows.map(row => row[0]);
    expect(new Set(schemas).size).toBe(schemas.length);
    const numbers = schemas.map(schema => schema.split('.').map(Number));
    numbers.slice(1).forEach((current, index) => {
      const previous = numbers[index];
      expect(current[0] > previous[0] || (current[0] === previous[0] && current[1] > previous[1])).toBe(true);
    });
  });
});
