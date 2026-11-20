import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { conditionExpression, convertWhenYaml, yamlScalar } from '../src/convert-content-5';
import { EXPERIENCE, entry, loadBuild, makeContent, scene } from './helpers';

afterEach(() => vi.unstubAllEnvs());

/** The one-off conversion of a 4.x content source to schema 5.0 (#334) – the rules Migration5.php follows */
describe('content 4.x → 5.0: conditions become expressions', () => {
  it('turns every test into a comparison, all into &&, any into ||, not into !=', () => {
    expect(conditionExpression({ hasKey: true })).toEqual({ expression: 'hasKey == true', approximate: [] });
    expect(conditionExpression({ hasKey: true, tries: 3 })).toEqual({ expression: 'hasKey == true && tries == 3', approximate: [] });
    expect(conditionExpression({ any: { mood: 'calm', tries: { not: 2.5 } } })).toEqual({ expression: 'mood == "calm" || tries != 2.5', approximate: [] });
    expect(conditionExpression({ said: 'a "quote" \\ here' })).toEqual({ expression: 'said == "a \\"quote\\" \\\\ here"', approximate: [] });
    expect(conditionExpression({})).toEqual({ expression: null, approximate: [] });
    expect(conditionExpression('already && done')).toEqual({ expression: 'already && done', approximate: [] });
  });

  it('a not-set test becomes a truth test (reported); what the language cannot write is an error', () => {
    expect(conditionExpression({ doorOpen: null, lamp: { not: null } })).toEqual({ expression: '!doorOpen && lamp', approximate: ['doorOpen', 'lamp'] });
    expect(conditionExpression({ and: true })).toMatchObject({ error: expect.stringContaining('"and"') });
    expect(conditionExpression({ a: [1] })).toMatchObject({ error: expect.stringContaining('"a"') });
    expect(conditionExpression(3)).toMatchObject({ error: expect.stringContaining('not a condition') });
  });

  it('writes an expression plain when YAML reads it back the same, else in single quotes', () => {
    expect(yamlScalar('hasKey == true')).toBe('hasKey == true');
    expect(yamlScalar('mood == "calm"')).toBe('mood == "calm"');
    expect(yamlScalar('!doorOpen')).toBe("'!doorOpen'");
    expect(yamlScalar("it's")).toBe("it's");
    expect(yamlScalar('a: b')).toBe("'a: b'");
  });

  it('rewrites flow and block conditions in place; comments and other lines stay', () => {
    const text = [
      'rules:',
      '  - on: found',
      '    when: { hasKey: true } # the key',
      '    do: { hide: hint }',
      '  - on: tap',
      '    when:',
      '      any:',
      '        a: 1',
      '        b: { not: x }',
      '    do: show',
      '  - on: tap',
      '    when: already',
      '    do: show',
      '  - on: tap',
      '    when: { and: 1 }',
      '    do: show',
    ].join('\n');
    const done = convertWhenYaml(text);
    expect(done.text.split('\n')).toEqual([
      'rules:',
      '  - on: found',
      '    when: hasKey == true # the key',
      '    do: { hide: hint }',
      '  - on: tap',
      '    when: a == 1 || b != "x"',
      '    do: show',
      '  - on: tap',
      '    when: already',
      '    do: show',
      '  - on: tap',
      '    when: { and: 1 }',
      '    do: show',
    ]);
    expect(done.converted).toBe(2);
    expect(done.problems).toEqual([expect.stringMatching(/^15: the variable "and"/)]);
  });

  it('a converted source builds', async () => {
    const rules = '  entity:\n    type: text\n    text: hi\n    components:\n      - type: behaviour\n        rules:\n          - on: tap\n            when: { seen: null, mood: calm }\n            do: { set: { seen: true } }\n';
    const { content } = makeContent({
      'experience.yaml': EXPERIENCE,
      'scenes/a/scene.yaml': scene('1–2'),
      'entries/e/entry.yaml': entry('a', 't.jpg', rules),
      'entries/e/t.jpg': 'jpg',
    });
    vi.stubEnv('OSCT_CONTENT_DIR', content);
    vi.resetModules();
    const { convertContent } = await import('../src/convert-content-5');
    expect(convertContent(content)).toEqual({ files: ['entries/e/entry.yaml'], converted: 1, problems: [], approximate: ['entries/e/entry.yaml:13: seen'] });
    expect(fs.readFileSync(path.join(content, 'entries/e/entry.yaml'), 'utf8')).toContain('            when: \'!seen && mood == "calm"\'\n');
    const build = await loadBuild({ content });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { entries } = build.buildAll();
    vi.restoreAllMocks();
    expect(build.errors).toEqual([]);
    expect(entries[0].target?.entity).toMatchObject({ components: [{ rules: [{ when: '!seen && mood == "calm"' }] }] });
  });
});

describe('content build: logic (schema 5.0)', () => {
  it('reads a scene\'s and the experience\'s logic and leaves the canvas out of the configuration', async () => {
    const logic = 'logic:\n  rules:\n    - on: ping\n      when: a > 1\n      do: { goto: "scene:a" }\n  canvas:\n    folds: [x]\n';
    const { content } = makeContent({
      'experience.yaml': EXPERIENCE + logic,
      'scenes/a/scene.yaml': scene('1–2') + logic,
    });
    const build = await loadBuild({ content });
    const { experience, scenes } = build.buildAll();
    expect(build.errors).toEqual([]);
    expect(experience.logic).toEqual({ rules: [{ on: 'ping', when: 'a > 1', do: { goto: 'scene:a' } }] });
    expect(scenes[0].logic).toEqual({ rules: [{ on: 'ping', when: 'a > 1', do: { goto: 'scene:a' } }] });
  });

  it('names a rule a scene cannot have', async () => {
    const { content } = makeContent({
      'experience.yaml': EXPERIENCE,
      'scenes/a/scene.yaml': scene('1–2') + 'logic:\n  rules:\n    - on: tap\n      when: { a: 1 }\n      do: hide\n',
    });
    const build = await loadBuild({ content });
    build.buildAll();
    expect(build.errors).toEqual([
      expect.stringContaining('scenes/a: logic.rules[0].on: tap is a node\'s own event'),
      expect.stringContaining('scenes/a: logic.rules[0].when: a condition is an expression since content schema 5.0'),
      expect.stringContaining('scenes/a: logic.rules[0].do: hide alone acts on the rule\'s own node'),
    ]);
  });
});
