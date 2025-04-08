/* @deprecated */
class ErrorScreen extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._active = false;
  }

  static get observedAttributes() {
    return ["active"];
  }

  get active() {
    return this._active;
  }

  set active(value) {
    this._active = value;
    this.setAttribute("active", value);
    this.updateVisibility();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "active") {
      this._active = newValue === "true";
      this.updateVisibility();
    }
  }

  connectedCallback() {
    this.render();
    this.updateVisibility();
  }

  updateVisibility() {
    this.style.visibility = this._active ? "visible" : "hidden";
  }

  render() {
    this.shadowRoot.innerHTML = /* html */ `
      <style>
        :host {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
        /* background: url('https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExa3Q1MW9lazRvY252OGN1bHA5azYwNXlsbWU0NWxnbXgxZWZtMjRiciZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/FSqYDfsdaiG9W/giphy.webp') no-repeat center center;
        background-size: cover; */
        background: var(--color-background);
          z-index: 1000;
        }
        .message {
          font-size: 1em;
          color: var(--color-primary);
          padding: 4rem;
          text-align: center;
        }
      </style>
      <div class="message">Please enable camera access to use this app</div>
    `;
  }
}

customElements.define("error-screen", ErrorScreen);
