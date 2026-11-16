import { PageMinimal } from "./page-minimal";
import "@/components/scan";

/**
 * Scan mode page: transparent over the camera, found-target indicator in the center, spread menu at the
 * bottom, the subtitle line of a speaking video above it. The top chrome comes from `header.ts`.
 */
export class SpreadPage extends PageMinimal {
  get styles(): string {
    return /* css */ `
      /* Full viewport: the page transition's transform makes :host the containing block of the
         fixed children below. Taps pass through except on the menu and the indicator. */
      :host {
        position: fixed;
        inset: 0;
        background: none;
        border-radius: 0;
        pointer-events: none;
      }
      found-indicator {
        position: fixed;
        left: 0;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
      }
      subtitle-line {
        position: fixed;
        left: 0;
        right: 0;
        bottom: calc(max(1rem, env(safe-area-inset-bottom)) + var(--subtitle-offset));
      }
      spread-menu {
        position: fixed;
        left: 0;
        right: 0;
        bottom: max(1rem, env(safe-area-inset-bottom));
      }
    `;
  }

  get template(): string {
    return /* html */ `
      <found-indicator></found-indicator>
      <subtitle-line></subtitle-line>
      <spread-menu></spread-menu>
    `;
  }
}

customElements.define("spread-page", SpreadPage);
