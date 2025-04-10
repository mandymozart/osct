export class QrIcon extends HTMLElement {
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
                    display: flex;
                    width: 24px;
                    height: 24px;
                }
                svg {
                    width: 100%;
                    height: 100%;
                }
                svg path, svg rect {
                    fill: currentColor;
                }
            </style>
            <svg width="24" xmlns="http://www.w3.org/2000/svg" height="24" fill="none">
                <path d="M0.000,24.000L10.909,24.000L10.909,13.091L0.000,13.091L0.000,24.000ZZM2.182,15.273L8.727,15.273L8.727,21.801L2.182,21.801L2.182,15.273ZZ" style="fill: currentColor; fill-opacity: 1;" class="fills"/>
                <rect rx="0" ry="0" x="4.364" y="17.454" transform="matrix(1.000000, 0.000000, 0.000000, 1.000000, 0.000000, 0.000000)" width="2.182" height="2.182" style="fill: currentColor; fill-opacity: 1;" class="fills"/>
                <rect rx="0" ry="0" x="17.454" y="21.818" transform="matrix(1.000000, 0.000000, 0.000000, 1.000000, 0.000000, 0.000000)" width="2.182" height="2.182" style="fill: currentColor; fill-opacity: 1;" class="fills"/>
                <rect rx="0" ry="0" x="21.818" y="21.818" transform="matrix(1.000000, 0.000000, 0.000000, 1.000000, 0.000000, 0.000000)" width="2.182" height="2.182" style="fill: currentColor; fill-opacity: 1;" class="fills"/>
                <path d="M21.818,15.273L19.636,15.273L19.636,13.091L13.091,13.091L13.091,24.000L15.273,24.000L15.273,17.454L17.454,17.454L17.454,19.636L24.000,19.636L24.000,13.091L24.000,13.091L21.818,13.091Z" style="fill: currentColor; fill-opacity: 1;" class="fills"/>
                <path d="M0.000,10.909L10.909,10.909L10.909,0.000L0.000,0.000L0.000,10.909ZZM2.182,2.182L8.727,2.182L8.727,8.727L2.182,8.727L2.182,2.182ZZ" style="fill: currentColor; fill-opacity: 1;" class="fills"/>
                <rect rx="0" ry="0" x="4.364" y="4.364" transform="matrix(1.000000, 0.000000, 0.000000, 1.000000, 0.000000, 0.000000)" width="2.182" height="2.182" style="fill: currentColor; fill-opacity: 1;" class="fills"/>
                <path d="M13.091,0.000L13.091,10.909L24.000,10.909L24.000,0.000L13.091,0.000ZZM21.818,8.727L15.273,8.727L15.273,2.182L21.818,2.182L21.818,8.727ZZ" style="fill: currentColor; fill-opacity: 1;" class="fills"/>
                <rect rx="0" ry="0" x="17.454" y="4.364" transform="matrix(1.000000, 0.000000, 0.000000, 1.000000, 0.000000, 0.000000)" width="2.182" height="2.182" style="fill: currentColor; fill-opacity: 1;" class="fills"/>
            </svg>
        `;
    }
}

customElements.define('qr-icon', QrIcon);
