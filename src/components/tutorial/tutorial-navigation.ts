/**
 * A navigation component for the tutorial with step indicators and navigation buttons
 */
export class TutorialNavigation extends HTMLElement {
    // Properties
    private _currentStep: number = 1;
    private _totalSteps: number = 5;
    private _isLastStep: boolean = false;
    private _isFirstStep: boolean = true;
    private _nextDisabled: boolean = false;
    
    // Event handlers bound to the component instance
    private boundHandleNext: () => void;
    
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      
      // Bind event handlers to the instance
      this.boundHandleNext = this.handleNext.bind(this);
    }
    
    static get observedAttributes() {
      return [
        'current-step', 
        'total-steps', 
        'is-last-step',
        'is-first-step',
        'next-disabled'
      ];
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
        this.updateIndicators();
      }
    }
    
    /**
     * Get total number of steps
     */
    get totalSteps(): number {
      return this._totalSteps;
    }
    
    /**
     * Set total number of steps
     */
    set totalSteps(value: number) {
      if (this._totalSteps !== value) {
        this._totalSteps = value;
        this.setAttribute('total-steps', value.toString());
        this.renderIndicators();
      }
    }
    
    /**
     * Get if this is the last step
     */
    get isLastStep(): boolean {
      return this._isLastStep;
    }
    
    /**
     * Set if this is the last step
     */
    set isLastStep(value: boolean) {
      if (this._isLastStep !== value) {
        this._isLastStep = value;
        this.setAttribute('is-last-step', value.toString());
        this.updateNextButton();
      }
    }
    
    /**
     * Get if this is the first step
     */
    get isFirstStep(): boolean {
      return this._isFirstStep;
    }
    
    /**
     * Set if this is the first step
     */
    set isFirstStep(value: boolean) {
      if (this._isFirstStep !== value) {
        this._isFirstStep = value;
        this.setAttribute('is-first-step', value.toString());
        this.updatePreviousButton();
      }
    }
    
    /**
     * Get if the next button is disabled
     */
    get nextDisabled(): boolean {
      return this._nextDisabled;
    }
    
    /**
     * Set if the next button is disabled
     */
    set nextDisabled(value: boolean) {
      if (this._nextDisabled !== value) {
        this._nextDisabled = value;
        this.setAttribute('next-disabled', value.toString());
        this.updateNextButton();
      }
    }
    
    /**
     * Handle attribute changes
     */
    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
      if (oldValue === newValue) return;
      
      switch (name) {
        case 'current-step':
          this._currentStep = parseInt(newValue) || 1;
          this.updateIndicators();
          break;
          
        case 'total-steps':
          this._totalSteps = parseInt(newValue) || 5;
          this.renderIndicators();
          break;
          
        case 'is-last-step':
          this._isLastStep = newValue === 'true';
          this.updateNextButton();
          break;
          
        case 'is-first-step':
          this._isFirstStep = newValue === 'true';
          this.updatePreviousButton();
          break;
          
        case 'next-disabled':
          this._nextDisabled = newValue === 'true';
          this.updateNextButton();
          break;
      }
    }
    
    /**
     * Connected callback - Initialize the component
     */
    connectedCallback() {
      this.render();
      this.setupEventListeners();
      this.renderIndicators();
      this.updateIndicators();
      this.updateNextButton();
      this.updatePreviousButton();
    }
    
    /**
     * Disconnected callback - Clean up event listeners
     */
    disconnectedCallback() {
      this.cleanupEventListeners();
    }
    
    /**
     * Render the component structure
     */
    private render() {
      if (!this.shadowRoot) return;
      
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: flex;
            justify-content: space-between;
            width: 100%;
            padding: 1rem 0;
            box-sizing: border-box;
            flex-direction: column-reverse;
            gap:1rem;
          }
          
          .step-indicators {
            display: flex;
            gap: 0.5rem;
            justify-content: center;
          }
          
          .step-indicator {
            width: 1rem;
            height: 1rem;
            border-radius: 50%;
            background-color: var(--background-color, #fff);
            border: 1px solid var(--color-primary, #333);
            transition: all 0.2s ease;
          }
          
          .step-indicator.active {
            border-color: var(--color-secondary, #0066cc);
          }
          
          .nav-buttons {
            display: flex;
            justify-content: flex-end;
          }
          
          button {
          width: 100%;}
        </style>
        
        <div class="step-indicators">
          <!-- Step indicators will be created dynamically -->
        </div>
        
        <div class="nav-buttons">
          <button is="text-button" variant="secondary" class="next-button">Continue</button>
        </div>
      `;
    }
    
    /**
     * Set up event listeners
     */
    private setupEventListeners() {
      if (!this.shadowRoot) return;
      
      const nextButton = this.shadowRoot.querySelector('.next-button');
      if (nextButton) {
        nextButton.addEventListener('click', this.boundHandleNext);
      }
    }
    
    /**
     * Clean up event listeners
     */
    private cleanupEventListeners() {
      if (!this.shadowRoot) return;
      
      const nextButton = this.shadowRoot.querySelector('.next-button');
      if (nextButton) {
        nextButton.removeEventListener('click', this.boundHandleNext);
      }
    }
    
    /**
     * Create the step indicator circles
     */
    private renderIndicators() {
      if (!this.shadowRoot) return;
      
      const indicatorsContainer = this.shadowRoot.querySelector('.step-indicators');
      if (!indicatorsContainer) return;
      
      // Clear existing indicators
      indicatorsContainer.innerHTML = '';
      
      // Create new indicators
      for (let i = 0; i < this._totalSteps; i++) {
        const indicator = document.createElement('div');
        indicator.classList.add('step-indicator');
        if (i + 1 === this._currentStep) {
          indicator.classList.add('active');
        }
        indicatorsContainer.appendChild(indicator);
      }
    }
    
    /**
     * Update the active indicator based on current step
     */
    private updateIndicators() {
      if (!this.shadowRoot) return;
      
      const indicators = this.shadowRoot.querySelectorAll('.step-indicator');
      if (!indicators.length) return;
      
      indicators.forEach((indicator, index) => {
        indicator.classList.toggle('active', index + 1 === this._currentStep);
      });
    }
    
    /**
     * Update the next button text and disabled state
     */
    private updateNextButton() {
      if (!this.shadowRoot) return;
      
      const nextButton = this.shadowRoot.querySelector('.next-button') as HTMLButtonElement;
      if (!nextButton) return;
      
      nextButton.textContent = this._isLastStep ? 'Finish' : 'Continue';
      nextButton.disabled = this._nextDisabled;
    }
    
    /**
     * Update previous button state based on current step
     */
    private updatePreviousButton() {
      // This method is kept to avoid breaking existing code
      // but isn't needed anymore since the previous button was removed
    }
    
    /**
     * Handle next button click
     */
    private handleNext() {
      if (this._isLastStep) {
        // If it's the last step, dispatch a "finish" event
        this.dispatchEvent(new CustomEvent('finish', {
          bubbles: true,
          composed: true
        }));
      } else {
        // Otherwise dispatch the regular "next" event
        this.dispatchEvent(new CustomEvent('next', {
          bubbles: true,
          composed: true
        }));
      }
    }
  }
  
  customElements.define('tutorial-navigation', TutorialNavigation);