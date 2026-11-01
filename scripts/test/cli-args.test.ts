import { describe, expect, it } from 'vitest';
import { CliArgsError, parseArgs } from '../src/lib/cli-args';

/** The options of the osct command line (src/cli.ts) */
const OPTIONS = { flags: ['force', 'dry-run', 'without-videos', 'unknown', 'help'], values: ['env', 'min-age', 'keep'] };
const parse = (line: string) => parseArgs(line.split(' ').filter(Boolean), OPTIONS);

describe('osct command line arguments', () => {
  it('separates the command from its options, wherever they stand', () => {
    const cli = parse('content --env staging sync --dry-run');
    expect(cli.positional).toEqual(['content', 'sync']);
    expect(cli.option('env')).toBe('staging');
    expect(cli.flag('dry-run')).toBe(true);
    expect(cli.flag('force')).toBe(false);
  });

  it('an option value is never a positional, even when it looks like a command', () => {
    const cli = parse('content purge --env content --keep 3');
    expect(cli.positional).toEqual(['content', 'purge']);
    expect(cli.option('env')).toBe('content');
  });

  it('no arguments: no command, no options', () => {
    const cli = parse('');
    expect(cli.positional).toEqual([]);
    expect(cli.option('env')).toBeUndefined();
  });

  it('refuses an option it does not know – a misspelt --dry-run never runs for real', () => {
    expect(() => parse('content purge --env production --dryrun')).toThrow(new CliArgsError('Unknown option --dryrun'));
    expect(() => parse('content sync --env=staging')).toThrow('Unknown option --env=staging');
  });

  it('refuses a value option without its value', () => {
    expect(() => parse('content status --env')).toThrow('--env needs a value');
    expect(() => parse('content purge --keep --dry-run')).toThrow('--keep needs a value');
  });

  it('reads numbers ≥ 0, the fallback when not given', () => {
    const cli = parse('content purge --min-age 2.5 --keep 0');
    expect(cli.number('min-age', 30)).toBe(2.5);
    expect(cli.number('keep', 3)).toBe(0);
    expect(parse('content purge').number('keep', 3)).toBe(3);
  });

  it('refuses a number that is negative, not a number or empty', () => {
    for (const value of ['-1', 'three', 'Infinity']) {
      expect(() => parse(`content purge --keep ${value}`).number('keep', 3)).toThrow('--keep needs a number ≥ 0');
    }
    expect(() => parseArgs(['--keep', ' '], OPTIONS).number('keep', 3)).toThrow('--keep needs a number ≥ 0');
  });

  it('the last of a repeated value option wins', () => {
    expect(parse('--env staging --env production').option('env')).toBe('production');
  });
});
