export class LoadingUI extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        this.setupListeners();
    }

    private render() {
        this.shadowRoot!.innerHTML = /* html */`
            <style>
                .loading {
                    display: none;
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
            </style>
            <div class="loading">Loading...</div>
        `;
    }

    private setupListeners() {
        this.addEventListener('loading-change', ((e: CustomEvent) => {
            const loader = this.shadowRoot!.querySelector('.loading');
            if (loader) {
                loader.style.display = e.detail.loading ? 'block' : 'none';
            }
        }) as EventListener);
    }
}

customElements.define('loading-ui', LoadingUI);