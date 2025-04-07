/**
 * Component for displaying tutorial step content including
 * title, description and illustration
 */
export class TutorialStepContent extends HTMLElement {
    // Properties
    private _title: string = '';
    private _description: string = '';
    private _illustration: string = '';
    private _currentStep: number = 1;
    private _totalSteps: number = 5;
    
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }
    
    static get observedAttributes() {
      return ['title', 'description', 'illustration', 'current-step', 'total-steps'];
    }
    
    /**
     * Get step title
     */
    get title(): string {
      return this._title;
    }
    
    /**
     * Set step title
     */
    set title(value: string) {
      if (this._title !== value) {
        this._title = value;
        this.setAttribute('title', value);
        this.updateContent();
      }
    }
    
    /**
     * Get step description
     */
    get description(): string {
      return this._description;
    }
    
    /**
     * Set step description
     */
    set description(value: string) {
      if (this._description !== value) {
        this._description = value;
        this.setAttribute('description', value);
        this.updateContent();
      }
    }
    
    /**
     * Get illustration path
     */
    get illustration(): string {
      return this._illustration;
    }
    
    /**
     * Set illustration path
     */
    set illustration(value: string) {
      if (this._illustration !== value) {
        this._illustration = value;
        this.setAttribute('illustration', value);
        this.updateContent();
      }
    }
    
    /**
     * Get current step number
     */
    get currentStep(): number {
      return this._currentStep;
    }
    
    /**
     * Set current step number
     */
    set currentStep(value: number) {
      if (this._currentStep !== value) {
        this._currentStep = value;
        this.setAttribute('current-step', value.toString());
        this.updateContent();
      }
    }
    
    /**
     * Get total steps
     */
    get totalSteps(): number {
      return this._totalSteps;
    }
    
    /**
     * Set total steps
     */
    set totalSteps(value: number) {
      if (this._totalSteps !== value) {
        this._totalSteps = value;
        this.setAttribute('total-steps', value.toString());
        this.updateContent();
      }
    }
    
    /**
     * Handle attribute changes
     */
    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
      if (oldValue === newValue) return;
      
      switch (name) {
        case 'title':
          this._title = newValue;
          break;
          
        case 'description':
          this._description = newValue;
          break;
          
        case 'illustration':
          this._illustration = newValue;
          break;
          
        case 'current-step':
          this._currentStep = parseInt(newValue) || 1;
          break;
          
        case 'total-steps':
          this._totalSteps = parseInt(newValue) || 5;
          break;
      }
      
      if (this.shadowRoot) {
        this.updateContent();
      }
    }
    
    /**
     * Connected callback - Initialize the component
     */
    connectedCallback() {
      this.render();
      this.updateContent();
    }
    
    /**
     * Render the component structure
     */
    private render() {
      if (!this.shadowRoot) return;
      
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            text-align: left;
          }
          
          .step-header {
            font-size: 1.25rem;
            color: var(--primary-500);
            margin-bottom: 1rem;
          }
          
          .illustration {
            margin: 5rem 0;
  height: 4rem;
          }
          
          .title {
            font-size: 1.5rem;
            font-weight: 400;
            margin-bottom: 1rem;
          }
          
          .description {
            font-size: 1.25rem;
            line-height: 1.5;
            margin-bottom: 2rem;
          }
        </style>
        
        <div class="content-container">
          <div class="step-header"></div>
          <img class="illustration" alt="Tutorial illustration" />
          <h2 class="title"></h2>
          <p class="description"></p>
        </div>
      `;
    }
    
    /**
     * Update content based on properties
     */
    private updateContent() {
      if (!this.shadowRoot) return;
      
      const stepHeaderElement = this.shadowRoot.querySelector('.step-header');
      const imgElement = this.shadowRoot.querySelector('.illustration') as HTMLImageElement;
      const titleElement = this.shadowRoot.querySelector('.title');
      const descriptionElement = this.shadowRoot.querySelector('.description');
      
      if (stepHeaderElement) {
        stepHeaderElement.textContent = `Step ${this._currentStep} of ${this._totalSteps}`;
      }
      
      if (imgElement && this._illustration) {
        imgElement.src = this._illustration;
        imgElement.alt = this._title;
      }
      
      if (titleElement) {
        titleElement.textContent = this._title;
      }
      
      if (descriptionElement) {
        descriptionElement.textContent = this._description;
      }
    }
  }
  
  customElements.define('tutorial-step-content', TutorialStepContent);