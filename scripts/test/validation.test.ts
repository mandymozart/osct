import { describe, expect, it } from 'vitest';
import { validateContent, validateField } from '../src/lib/validation';

/** Field-level checks of authored YAML (lib/schema.ts): required fields, defaults, coercion */
describe('content validation', () => {
  it('fills defaults and keeps fields the schema does not name', () => {
    expect(validateContent({ title: 'A', firstPage: 2, lastPage: 3, note: 'kept' }, 'spread'))
      .toEqual({ title: 'A', order: 0, firstPage: 2, lastPage: 3, note: 'kept' });
    expect(validateContent({ category: 'glossary', title: 'T', page: 4 }, 'entry')).toMatchObject({ body: '', tags: [] });
  });

  it('refuses a missing required field', () => {
    expect(() => validateContent({ title: 'A', firstPage: 2 }, 'spread')).toThrow("Required field 'lastPage' missing for spread");
  });

  it('refuses anything but a mapping, and an unknown content type', () => {
    expect(() => validateContent(['title'], 'spread')).toThrow('Expected the fields of a spread');
    expect(() => validateContent({}, 'chapter')).toThrow('Unknown content type: chapter');
    expect(() => validateContent({}, 'toString')).toThrow('Unknown content type: toString');
  });

  it('a number written as text becomes a number; other text is refused', () => {
    expect(validateContent({ title: 'A', firstPage: '2', lastPage: 3 }, 'spread').firstPage).toBe(2);
    expect(() => validateContent({ title: 'A', firstPage: 'two', lastPage: 3 }, 'spread')).toThrow("Field 'firstPage' in spread must be a number");
  });

  it('a list is an array of texts or one comma-separated text', () => {
    const tags = { type: 'List', required: false } as const;
    expect(validateField('a, b ,, c', tags, 'tags', 'entry')).toEqual(['a', 'b', 'c']);
    expect(validateField(['a', 'b'], tags, 'tags', 'entry')).toEqual(['a', 'b']);
    expect(() => validateField([1, 'b'], tags, 'tags', 'entry')).toThrow("Field 'tags' in entry must be an array of strings or comma-separated string");
    expect(() => validateField(3, tags, 'tags', 'entry')).toThrow(/must be an array of strings/);
  });

  it('checks texts against their allowed values', () => {
    expect(() => validateContent({ category: 'chapter', title: 'T', page: 1 }, 'entry')).toThrow("Field 'category' in entry must be one of:");
    expect(() => validateContent({}, 'step')).toThrow('Unknown content type: step');
  });

  it('checks booleans, arrays and objects', () => {
    expect(() => validateField('yes', { type: 'Boolean', required: false }, 'on', 'x')).toThrow("Field 'on' in x must be a boolean");
    expect(() => validateField({}, { type: 'Array', required: false }, 'passes', 'spread')).toThrow("Field 'passes' in spread must be an array");
    expect(() => validateField([], { type: 'Object', required: false }, 'target', 'entry')).toThrow("Field 'target' in entry must be an object");
    expect(() => validateField(null, { type: 'Object', required: false }, 'target', 'entry')).toThrow("Field 'target' in entry must be an object");
    expect(() => validateField(1, { type: 'String', required: false }, 'title', 'entry')).toThrow("Field 'title' in entry must be a string");
  });
});
