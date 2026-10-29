/**
 * The osct command line's arguments (`src/cli.ts`): positionals, `--flag`s and `--option <value>`s. Only the
 * options the command line knows are accepted – a mistyped one (`--dryrun`) is an error, never ignored, so a
 * purge or sync never runs for real because a safety flag was misspelt.
 */

export interface CliOptions {
  /** Options without a value (`--force`) */
  flags: readonly string[];
  /** Options followed by a value (`--env staging`) */
  values: readonly string[];
}

export interface CliArgs {
  positional: string[];
  option(name: string): string | undefined;
  flag(name: string): boolean;
  /** A value option as a number ≥ 0, `fallback` when it is not given */
  number(name: string, fallback: number): number;
}

export class CliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliArgsError';
  }
}

export function parseArgs(args: readonly string[], known: CliOptions): CliArgs {
  const positional: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (known.flags.includes(name)) {
      flags.add(name);
    } else if (known.values.includes(name)) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) throw new CliArgsError(`--${name} needs a value`);
      values.set(name, value);
      i++;
    } else {
      throw new CliArgsError(`Unknown option ${arg}`);
    }
  }
  const option = (name: string) => values.get(name);
  return {
    positional,
    option,
    flag: name => flags.has(name),
    number: (name, fallback) => {
      const value = option(name);
      if (value === undefined) return fallback;
      const parsed = Number(value);
      if (value.trim() === '' || !Number.isFinite(parsed) || parsed < 0) throw new CliArgsError(`--${name} needs a number ≥ 0`);
      return parsed;
    },
  };
}
