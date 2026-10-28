import path from 'path';

/** Whether the module at `moduleUrl` (`import.meta.url`) is the script node was started with, not an import */
export function isMainModule(moduleUrl: string): boolean {
  if (!process.argv[1]) return false;
  const modulePath = new URL(moduleUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  return path.resolve(process.argv[1]) === path.resolve(modulePath);
}
