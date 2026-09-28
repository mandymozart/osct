// Command-line options for the commands, robust against npm and PowerShell.
//
// `npm run x -- --gpu default` reaches the command as `--gpu default`. But PowerShell removes the `--`
// (npm's PowerShell shim), and npm then takes unknown `--options` as its own config: `--gpu=default`
// becomes the environment variable npm_config_gpu=default, `--gpu default` becomes npm_config_gpu=true
// plus a stray argument "default". So options are read from the arguments first, then from
// npm_config_*; a value option that npm turned into `true` stops with a hint to write `--name=value`.

export type Options = Record<string, string | true>;

export function parseOptions(argv: string[], { values = [], flags = [] }: { values?: string[]; flags?: string[] }): { options: Options; rest: string[] } {
  const args = [...argv];
  const options: Options = {};
  for (const name of [...values, ...flags]) {
    const i = args.findIndex(arg => arg === `--${name}` || arg.startsWith(`--${name}=`));
    if (i >= 0) {
      const [arg] = args.splice(i, 1);
      if (arg.includes("=")) options[name] = arg.slice(arg.indexOf("=") + 1);
      else options[name] = values.includes(name) ? args.splice(i, 1)[0] : true;
      continue;
    }
    const env = process.env[`npm_config_${name.replace(/-/g, "_")}`];
    if (env === undefined || env === "") continue;
    if (values.includes(name)) {
      if (env === "true") {
        throw new Error(
          `npm took --${name} apart (PowerShell drops the "--"). Write it with "=": --${name}=<value>, ` +
            `or run npm.cmd run … -- --${name} <value>.`,
        );
      }
      options[name] = env;
    } else if (env === "true") {
      options[name] = true;
    }
  }
  return { options, rest: args };
}

/** A value option as text (undefined when missing or given as a bare flag) */
export const text = (options: Options, name: string): string | undefined =>
  typeof options[name] === "string" ? (options[name] as string) : undefined;
