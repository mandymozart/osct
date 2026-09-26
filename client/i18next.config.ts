import { defineConfig } from "i18next-cli";
import { DEFAULT_LANGUAGE, LANGUAGES } from "./src/i18n/languages";

/**
 * i18next-cli (https://github.com/i18next/i18next-cli) – translations in
 * `src/i18n/locales/<language>/<namespace>.json` (i18next JSON v4), one namespace per page or area.
 *
 *   npm run i18n          extract keys used in the code into the JSON files + generate the types
 *   npm run i18n:status   report missing translations (warning only – never fails the build)
 *   npm run i18n:watch    the same as `i18n`, on every change
 *
 * `npm run build` runs `i18n` and `i18n:status` first.
 */
export default defineConfig({
  locales: [...LANGUAGES],
  extract: {
    input: ["src/**/*.ts"],
    ignore: ["src/**/__tests__/**", "src/i18n/**", "src/**/*.d.ts"],
    output: "src/i18n/locales/{{language}}/{{namespace}}.json",
    primaryLanguage: DEFAULT_LANGUAGE,
    // Every key carries its namespace: i18next.t("entry:accessPage")
    defaultNS: false,
    nsSeparator: ":",
    keySeparator: ".",
    // Missing translations stay empty – i18next then shows English (returnEmptyString: false)
    defaultValue: "",
    // Keys built at runtime (browser name, category) – keep them even if extraction can't resolve them
    preservePatterns: ["camera:*", "entries:categories.*"],
    removeUnusedKeys: true,
    sort: false,
    indentation: 2,
  },
  types: {
    input: ["src/i18n/locales/en/*.json"],
    output: "src/i18n/i18next.d.ts",
    resourcesFile: "src/i18n/resources.d.ts",
  },
});
