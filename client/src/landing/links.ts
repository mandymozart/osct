import { landingQrUrlOf } from "@ui/landing/links";
import { experiencePrefix } from "../utils/experience-path";

export { privacyHref } from "../utils/experience-path";

/** The address the landing page's QR code opens: this experience here (`/<experience>/`, #343), with the landing page as its source (`?s=lp1`) */
export const landingQrUrl = (origin: string = location.origin, prefix: string = experiencePrefix()): string => landingQrUrlOf(origin, prefix);
