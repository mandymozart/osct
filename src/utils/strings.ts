/**
 * Converts a camelCase string to kebab-case (dash-case)
 * @param {string} str - The camelCase string to convert
 * @return {string} The kebab-case version of the string
 */
export const camelToKebab = (str: string) => {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
};
