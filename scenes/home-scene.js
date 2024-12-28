export class HomeScene extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });

    const template = document.createElement("template");
    template.innerHTML = /*html*/ `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
        }
      </style>
      <h1>Onion Skin and Crocodile Tears</h1>
      <h2>Kevin Bray</h2>
      <p>Pick a scene / Order the book</p>
    `;

    shadow.appendChild(template.content.cloneNode(true));
  }
}

customElements.define("home-scene", HomeScene);
