import "i18next";
import type { Messages } from "./en";

/** Typed keys: `i18next.t("entry:accessPage")` is checked against the English texts */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: false;
    resources: Messages;
  }
}
