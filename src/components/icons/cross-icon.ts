export class CrossIcon extends HTMLElement {
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
                .cross-line {
                    stroke: currentColor;
                    stroke-width: 1;
                    stroke-linecap: round;
                }
            </style>
            <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">
                <line x1="6" y1="6" x2="18" y2="18" class="cross-line" />
                <line x1="6" y1="18" x2="18" y2="6" class="cross-line" />
            </svg>
        `;
    }
}

customElements.define('cross-icon', CrossIcon);