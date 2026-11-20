/**
 * One-off conversion of a content source folder from schema 4.x to 5.0 (#334): `node dist/convert-content-5.js`
 * converts `OSCT_CONTENT_DIR` in place (`npm run convert:5`). Used for `fixtures/content` and `fixtures/demo`; the
 * server's migration of the experiences it stores (`server/api/src/Migration5.php`) follows the same rules:
 *
 * Every behaviour rule's `when` in the object form of 2.19–4.x becomes an expression (`shared/text/expressions.ts`):
 * - each test `name: value` → `name == value`, `name: { not: value }` → `name != value` (a text quoted as the language
 *   wants: `mood == "happy"`, numbers and true / false as they are);
 * - the tests of the plain form are joined with ` && ` (all), those of `{ any: … }` with ` || ` (one);
 * - `name: null` (not set) → `!name`, `name: { not: null }` → `name` – the language has no "not set", so these become
 *   truth tests: approximate (a variable set to 0, "" or false now counts as not set) and reported;
 * - a test the language cannot write (a variable named like a word of the language – `and`, `or`, `not`, `mod`,
 *   `true`, `false` – or a value that is no text, number or true / false) is left as it is and reported: the build
 *   then names it, and a person rewrites it.
 * A `when` that is already a text stays. Text in, text out: only the `when` lines change (comments survive); a flow
 * mapping on the line (`when: { hasKey: true }`) and a block mapping below it are both read.
 */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { CONTENT_DIR, requireContentDir } from './config';
import { isMainModule } from './lib/entry';
import { isObject } from '../../shared/guards/primitives';
import { BEHAVIOUR_NAME_PATTERN } from '../../shared/types/behaviour';
import { expressionLiteral } from '../../shared/text/expressions';

/** The words of the expression language a variable cannot be named */
const LANGUAGE_WORDS = ['and', 'or', 'not', 'mod', 'true', 'false'];

/** A condition of 2.19–4.x as an expression – or why it cannot be one; `approximate` names a not-set test that became a truth test */
export type Converted = { expression: string | null; approximate: string[] } | { error: string };

/** The object form of a condition → an expression (null: no tests – the rule runs always) */
export function conditionExpression(when: unknown): Converted {
  if (typeof when === 'string') return { expression: when, approximate: [] };
  if (!isObject(when)) return { error: `not a condition: ${JSON.stringify(when)}` };
  const any = 'any' in when && Object.keys(when).length === 1 && isObject(when.any);
  const tests = Object.entries(any ? (when.any as Record<string, unknown>) : when);
  const parts: string[] = [];
  const approximate: string[] = [];
  for (const [name, raw] of tests) {
    if (!BEHAVIOUR_NAME_PATTERN.test(name) || LANGUAGE_WORDS.includes(name)) return { error: `the variable "${name}" cannot be named in an expression (a word of the language, or no camelCase name)` };
    const negated = isObject(raw) && Object.keys(raw).length === 1 && 'not' in raw;
    const value = negated ? (raw as { not: unknown }).not : raw;
    if (value === null) {
      parts.push(negated ? name : `!${name}`);
      approximate.push(name);
    } else if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      parts.push(`${name} ${negated ? '!=' : '=='} ${expressionLiteral(value)}`);
    } else {
      return { error: `the test of "${name}" has no value an expression can write: ${JSON.stringify(raw)}` };
    }
  }
  return { expression: parts.length ? parts.join(any ? ' || ' : ' && ') : null, approximate };
}

/** An expression as a YAML value on its line: plain when YAML reads it back as the same text, else in single quotes */
export function yamlScalar(text: string): string {
  try {
    const back = (yaml.load(`v: ${text}`) as { v?: unknown } | undefined)?.v;
    if (back === text && !text.includes(' #')) return text;
  } catch {
    // not plain
  }
  return `'${text.replace(/'/g, "''")}'`;
}

export interface ConvertedFile {
  text: string;
  /** Conditions rewritten */
  converted: number;
  /** `line: why` of the conditions left as they were */
  problems: string[];
  /** `line: variable` of the not-set tests that became truth tests */
  approximate: string[];
}

/** A YAML file's `when:` conditions in the object form → expressions (every other line as it was) */
export function convertWhenYaml(text: string): ConvertedFile {
  const lines = text.split('\n');
  const out: string[] = [];
  const done: ConvertedFile = { text, converted: 0, problems: [], approximate: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = /^(\s*(?:-\s+)?)when:(\s*)(.*)$/.exec(line);
    if (!match) {
      out.push(line);
      continue;
    }
    const [, lead, , restRaw] = match;
    const rest = restRaw.replace(/\s+#.*$/, '');
    const comment = restRaw.slice(rest.length);
    let source: string;
    let block: string[] = [];
    if (rest.trim() === '') {
      // A block mapping below: the lines indented deeper than the key
      const indent = lead.length;
      while (i + 1 < lines.length && (lines[i + 1].trim() === '' ? false : lines[i + 1].search(/\S/) > indent)) block.push(lines[++i]);
      if (!block.length) {
        out.push(line);
        continue;
      }
      source = block.join('\n');
    } else if (rest.trim().startsWith('{')) {
      source = rest;
    } else {
      out.push(line);
      continue;
    }
    let value: unknown;
    try {
      value = yaml.load(block.length ? dedent(block) : source);
    } catch (error) {
      done.problems.push(`${i + 1}: the condition does not read as YAML – ${(error as Error).message.split('\n')[0]}`);
      out.push(line, ...block);
      continue;
    }
    const result = conditionExpression(value);
    if ('error' in result) {
      done.problems.push(`${i + 1}: ${result.error}`);
      out.push(line, ...block);
      continue;
    }
    done.converted++;
    result.approximate.forEach(name => done.approximate.push(`${i + 1}: ${name}`));
    // No tests: the rule runs always – the line goes
    if (result.expression !== null) out.push(`${lead}when: ${yamlScalar(result.expression)}${comment}`);
    else if (lead.includes('-')) out.push(lead.trimEnd());
  }
  done.text = out.join('\n');
  return done;
}

const dedent = (block: string[]): string => {
  const indent = Math.min(...block.filter(line => line.trim()).map(line => line.search(/\S/)));
  return block.map(line => line.slice(indent)).join('\n');
};

const filesBelow = (dir: string, match: (name: string) => boolean): string[] =>
  !fs.existsSync(dir)
    ? []
    : fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) return item.name === 'node_modules' ? [] : filesBelow(full, match);
      return match(item.name) ? [full] : [];
    });

/** Convert a content folder in place; returns the files rewritten, the conditions converted and what a person checks */
export function convertContent(contentDir: string): { files: string[]; converted: number; problems: string[]; approximate: string[] } {
  const done = { files: [] as string[], converted: 0, problems: [] as string[], approximate: [] as string[] };
  const yamlFiles = [
    ...['experience.yaml'].map(name => path.join(contentDir, name)).filter(file => fs.existsSync(file)),
    ...['scenes', 'entries', 'entities'].flatMap(folder => filesBelow(path.join(contentDir, folder), name => /\.ya?ml$/.test(name))),
  ];
  for (const file of yamlFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const result = convertWhenYaml(text);
    const relative = path.relative(contentDir, file).replace(/\\/g, '/');
    result.problems.forEach(problem => done.problems.push(`${relative}:${problem}`));
    result.approximate.forEach(test => done.approximate.push(`${relative}:${test}`));
    done.converted += result.converted;
    if (result.text === text) continue;
    fs.writeFileSync(file, result.text);
    done.files.push(relative);
  }
  return done;
}

if (isMainModule(import.meta.url)) {
  console.log(`🔁 Content schema 4.x → 5.0: ${requireContentDir()}`);
  const done = convertContent(CONTENT_DIR);
  console.log(`✅ ${done.converted} conditions → expressions in ${done.files.length} files`);
  if (done.approximate.length) {
    console.log('⚠️  "not set" tests that became truth tests (0, "" and false now count as not set) – check them:');
    done.approximate.forEach(line => console.log(`   ${line}`));
  }
  if (done.problems.length) {
    console.log('❌ Conditions left as they were – rewrite them as expressions by hand:');
    done.problems.forEach(line => console.log(`   ${line}`));
    process.exitCode = 1;
  }
}
