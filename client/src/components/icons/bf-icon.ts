export class BfIcon extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
    }

    private render() {
        if (!this.shadowRoot) return;

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: inline-block;
                    width: 24px;
                    height: 24px;
                }
                svg {
                    width: 100%;
                    height: 100%;
                }
            </style>
            <svg xmlns="http://www.w3.org/2000/svg" id="logo" viewBox="0 0 800 600" shape-rendering="crispEdges" preserveAspectRatio="none">
              <path class="b" d="M358,255.38H339.49V139.49h23.59V71.79H314.87V39H282.05V0H0V.49H0V588.72H95.38V599H339.49V511.79h57.43V292.31H358ZM249.23,191.79H225.64v63.59H133.33V129.23h115.9ZM260.51,478H133.33V298.46H260.51Z"></path>
              <polygon class="f" points="800 22.59 800 6.15 508.72 6.15 508.72 0 425.64 0 425.64 64.61 455.38 64.61 455.38 226.67 438.97 226.67 438.97 271.8 455.38 271.8 455.38 511.8 435.9 511.8 435.9 530.26 404.1 530.26 404.1 598.97 540.26 598.97 593.09 598.97 673.85 598.97 673.85 569.23 591.79 569.23 591.79 530.26 562.05 530.26 562.05 492.31 552.82 527.18 137.44 767.18 245.13 800 245.13 800 22.59 800 22.59"></polygon>
            </svg>
        `;
    }
}

customElements.define('bf-icon', BfIcon);
