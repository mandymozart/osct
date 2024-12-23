import { LitElement, css, html } from 'lit';
import './components/user-interface.js';
import './scenes/book-scene.js';
import './scenes/home-scene.js';
import './scenes/index-scene.js';
import { scenes } from './scenes/index.js';

/**
 * XR App main element.
 */
export class XRApp extends LitElement {
  static get properties() {
    return {
      currentScene: { type: String },
    };
  }

  constructor() {
    super();
    this.currentScene = scenes.HOME; // Default scene set using enum-like object
  }

  handleSceneChange(event) {
    // Update the current scene using the value from the event detail
    this.currentScene = event.detail.scene;
  }

  render() {
    return html`
    <div class="scenes">
      ${this.currentScene === scenes.HOME
        ? html`<home-scene></home-scene>`
        : ''}
      ${this.currentScene === scenes.BOOK
        ? html`<book-scene></book-scene>`
        : ''}
      ${this.currentScene === scenes.INDEX
        ? html`<index-scene></index-scene>`
        : ''}
      </div>
      <user-interface @change-scene=${this.handleSceneChange}></user-interface>
    `;
  }

  static get styles() {
    return css`
      :host {
        width: 100vw;
        height: 100vh;
        text-align: center;
        z-index: 1000;
      }
      .scenes {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
      }
      user-interface {
        position: fixed;
        top: 0;
        left: 0;
        
      }
    `;
  }
}

window.customElements.define('xr-app', XRApp);
