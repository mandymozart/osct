/**
 * The static pages beside the app (#355): Privacy & terms is privacy.html, answered by the server for `/privacy` and
 * `/<experience>/privacy` (public/.htaccess). Offline the worker answers those with the precached privacy.html – never
 * with the app's shell.
 */
export const isPrivacyPage = (href: string): boolean => {
  const { pathname } = new URL(href);
  return /^\/([^/]+\/)?privacy\/?$/i.test(pathname) && !/^\/(editor|api)\//.test(pathname);
};
