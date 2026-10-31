/**
 * Which build a worker serves: a page asks the worker that took it over (`controllerchange`) whether it comes from the
 * page's own build (services/UpdateService.ts). A page opened after a deploy is controlled by the old worker until the
 * new one takes over, so a takeover alone does not mean the page runs old code – only a different build does.
 * Protocol: the page posts `{ type: BUILD_QUERY }` with a `MessagePort`; the worker answers on it with its build id
 * (the build date, `__VITE_BUILD_DATE__` – the page carries the same define).
 */

/** The message type of the query; the page's copy is in services/UpdateService.ts */
export const BUILD_QUERY = "osct-build";

/** Answers a build query on the port it came with; any other message is left alone (false) */
export const answerBuildQuery = (data: unknown, ports: readonly MessagePort[], build: string): boolean => {
  if (typeof data !== "object" || data === null || (data as { type?: unknown }).type !== BUILD_QUERY || !ports[0]) return false;
  ports[0].postMessage(build);
  return true;
};
