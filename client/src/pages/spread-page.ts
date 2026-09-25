import { PageMinimal } from "./page-minimal";
import "@/components/scan/found-indicator";
import "@/components/scan/spread-menu";

/**
 * Scan mode page (design p.6–14): transparent over the camera; found-target indicator in the center,
 * spread menu at the bottom. Mark and the counter are the top chrome (`header.ts`).
 * (The former spread card top left – spread info + link to the /spreads dev view – was removed on
 * 2026-09-25: the spread menu replaces it.)
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
      <spread-menu></spread-menu>
    `;
  }
}

customElements.define("spread-page", SpreadPage);
