/**
 * Converts a camelCase string to kebab-case (dash-case)
 * @param {string} str - The camelCase string to convert
 * @return {string} The kebab-case version of the string
 */
export const camelToKebab = (str: string) => {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
};

/** Escapes text for HTML (element content and attribute values) */
export const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Paragraphs of a text (blank line = new paragraph) */
export const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);
