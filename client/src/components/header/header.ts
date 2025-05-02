import { GameStoreService } from "@/services/GameStoreService";
import { IGame } from "@/types/game";

export class GameHeader extends HTMLElement {
  private game: Readonly<IGame>;

  constructor() {
    super();
    this.game = GameStoreService.getInstance();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
    this.initialize();
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
            <style>
                :host {}
                    
                header {
                    width: 100%;
                    position: fixed;
                    top: 0;
                    right: 0;
                    height: var(--offset-top,4rem);
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    cursor: pointer;
                    pointer-events: all;
                }
                
                .header-left {
                    padding-left: 1rem;
                }
                
                .header-right {
                    padding-right: 1rem;
                }
                
                .header-dash {
                    flex: 1;
                    background-color: var(--color-primary);
                height: 0.2rem;
                    transform: translateY(.1rem);
                    border-radius: 0.05rem;
                }
            </style>
            <slot></slot>
            <header id="main-header">
              <div class="header-left">Kevin Bray</div>
              <div class="header-dash"></div>
              <div class="header-right">Onion Skin and Crocodile Tears</div>
            </header>
        `;
  }

  private initialize() {
    const header = this.shadowRoot!.querySelector("#main-header");
    if (header) {
      header.addEventListener("click", () => {
        this.game.router.navigate("/about");
      });
    }
  }
}

customElements.define("game-header", GameHeader);
