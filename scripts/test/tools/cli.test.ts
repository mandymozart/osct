import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error – plain JavaScript tool module
import { parseOptions } from '../../tools/lib/cli.js';

const spec = { values: ['gpu', 'jobs'], flags: ['force', 'headed'] };
afterEach(() => vi.unstubAllEnvs());

describe('tools/lib/cli parseOptions', () => {
  it('reads --name value, --name=value and flags; the rest stays in order', () => {
    expect(parseOptions(['spread1', '--gpu', 'default', '--jobs=6', '--force', 'spread2'], spec)).toEqual({
      options: { gpu: 'default', jobs: '6', force: true },
      rest: ['spread1', 'spread2'],
    });
  });

  it('reads options npm kept for itself (PowerShell dropped the "--")', () => {
    vi.stubEnv('npm_config_gpu', 'default');
    vi.stubEnv('npm_config_force', 'true');
    expect(parseOptions(['spread1'], spec)).toEqual({ options: { gpu: 'default', force: true }, rest: ['spread1'] });
  });

  it('stops with a hint when npm split a value option', () => {
    vi.stubEnv('npm_config_gpu', 'true');
    expect(() => parseOptions(['default'], spec)).toThrow(/--gpu=<value>/);
  });

  it('prefers the command line over npm config', () => {
    vi.stubEnv('npm_config_jobs', '2');
    expect(parseOptions(['--jobs', '8'], spec).options.jobs).toBe('8');
  });
});
