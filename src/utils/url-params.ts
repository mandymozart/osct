/**
 * Get a specific parameter value from URL search params
 * @param key Parameter key to look for
 * @returns Parameter value or null if not found
 * @example
 * // URL: https://domain.com/?code=834jkkj3u34
 * getParam('code') // returns '834jkkj3u34'
 */
export const getUrlParam = (key: string): string | null => {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
};