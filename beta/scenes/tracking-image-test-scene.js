export class TrackingImageTestScene extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.currentImageIndex = 0;
      this.totalImages = 120;
      this.render();
    }
  
    connectedCallback() {
      this.shadowRoot
        .querySelector("img")
        .addEventListener("click", () => this.nextImage());
    }
  
    disconnectedCallback() {
      this.shadowRoot
        .querySelector("img")
        .removeEventListener("click", () => this.nextImage());
    }
  
    nextImage() {
      this.currentImageIndex = (this.currentImageIndex + 1) % this.totalImages;
      this.updateImage();
    }
  
    updateImage() {
      const imgElement = this.shadowRoot.querySelector("img");
      const imageNumber = String(this.currentImageIndex + 1).padStart(3, '0');
      imgElement.src = `/images/images-${imageNumber}.jpg`;
      imgElement.alt = `Image ${imageNumber}`;
    }
  
    render() {
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100vw;
            height: 100vh;
            background-color: white;
          }
          img {
            max-width: 80%;
            max-height: 80vh;
            cursor: pointer;
          }
        </style>
        <img src="/images/images-000.jpg" alt="Image 000" />
      `;
    }
  }
  
  customElements.define("tracking-image-test-scene", TrackingImageTestScene);