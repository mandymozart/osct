const gameStore = document.gameStore;

export class InfoScene extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });

    const template = document.createElement("template");
    template.innerHTML = /* html */ `
      <style>
        :host {
          display: block;
          background: white;
          position: fixed;
          bottom: 0;
          transform: translateY(calc(100vh - 6rem));
          border-top-left-radius: 2rem;
          border-top-right-radius: 2rem;
          transition: transform 0.3s;
          height: calc(100vh - 6rem);
          width: 100vw;
          pointer-events: all;
        }
        :host(.active) {
          transform: translateY(0);
        }
        .content {
          padding: 0 2rem;
          overflow-y: auto;
          height: calc(100vh - 8rem);
          margin-top: 2rem;
        } 
        .close-button {
          position: absolute;
          top: 2rem;
          right: 2rem;
          background-color: var(--color-primary);
          color: white;
          border: none;
          border-radius: 50%;
          width: 2rem;
          height: 2rem;
          font-size: 1.5rem;
          cursor: pointer;
        }
        .close-button:hover {
          border-color: var(--color-secondary);
          background-color: var(--color-background);
          color: var(--color-secondary);
        }
        .logo {
          height: 6em;
        }
      </style>
      
      <div class="content">
        <h2>Kevin Bray</h2>
        <h1>Onion Skin and Crocodile Tears</h1>
        <p>&copy; 2025</p>
        <p>Published by buildingfictions</p>
        <div>
          <a href="https://buildingfictions.com" target="_blank">
            <img src="/assets/bf.svg" class="logo" alt="buildingfictions logo" />
          </a>
        </div>
        <p>App by Tilman Porschuetz</p>
        <p>Requires a WebXR compatible browser and a copy of the book.</p>
        <a href="test.html">Developer: AR Tests</a>
      </div>
      <button class="close-button">×</button>
    `;

    shadow.appendChild(template.content.cloneNode(true));

    // Close
    this.shadowRoot
      .querySelector(".close-button")
      .addEventListener("click", () => {
        gameStore.setScene(null);
      });
  }
}

customElements.define("info-scene", InfoScene);
