export const camelToKebab = (str: string) => {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
};

/** Escapes text for HTML (element content and attribute values) – the brand's, shared with the landing piece */
export { escapeHtml } from "../../../ui/brand/html";

/** Paragraphs of a text (blank line = new paragraph) */
export const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);
