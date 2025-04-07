import { Page } from "./page";
import { assert } from "../utils/assert";
import { GameState } from "@/types";

import "../components/tutorial/tutorial-step-content";
import "../components/tutorial/tutorial-navigation";
import { TutorialStepProvider } from "../components/tutorial/tutorial-step-provider";

export class TutorialPage extends Page {
  protected get styles(): string {
    return /* css */ `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background-color: var(--color-background, #fff);
        color: var(--color-text, #333);
      }
      
      .content {
        position: relative;
        display: flex;
        flex-direction: column;
        padding: 2rem;
        gap: 2rem;
        height: 100%;
        box-sizing: border-box;
        overflow-y: auto;
      }
      
      .step-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        margin-bottom: auto;
      }
      
      .navigation-container {
        margin-top: auto;
      }
    `;
  }
  
  protected get template(): string {
    return `
      <div class="content">
        <div class="step-container">
          <tutorial-step-content></tutorial-step-content>
        </div>
        
        <div class="navigation-container">
          <tutorial-navigation></tutorial-navigation>
        </div>
        
        <close-button></close-button>
      </div>
    `;
  }
  
  // Reference to the step provider
  private stepProvider: TutorialStepProvider;
  
  constructor() {
    super();
    
    // Get the singleton instance of the step provider
    this.stepProvider = TutorialStepProvider.getInstance();
  }
  
  connectedCallback() {
    super.connectedCallback();
    
    assert(this.game, "GameStore not available in connectedCallback");
    
    // Process any initial route params that might be set
    const routeParams = this.getAttribute("route-params");
    if (routeParams) {
      this.handleRouteParamsChange(routeParams);
    }
    
    // Initialize components
    this.updateUI();
    
    // Subscribe to tutorial state changes from the game store
    this.game.subscribe(this.handleStateChange.bind(this));
  }
  
  disconnectedCallback() {
    super.disconnectedCallback();
    
    // Clean up game store subscription
    assert(this.game, "GameStore not available in disconnectedCallback");
    this.game.unsubscribe(this.handleStateChange.bind(this));
  }
  
  /**
   * Update UI based on current tutorial state
   */
  private updateUI(): void {
    // Get the current step ID from the tutorial manager
    const currentStepId = this.game?.tutorial.getCurrentStepId();
    if (!currentStepId) {
      console.warn('No current tutorial step to display');
      return;
    }
    
    // Get the step data from the provider
    const currentStep = this.stepProvider.getStepById(currentStepId);
    if (!currentStep) {
      console.warn(`Could not find step with ID: ${currentStepId}`);
      return;
    }
    
    this.updateStepContent(currentStep);
    this.updateNavigation(currentStepId);
  }
  
  /**
   * Update the step content component
   */
  private updateStepContent(step: { title: string, description: string, illustration: string }): void {
    const stepContent = this.shadowRoot?.querySelector('tutorial-step-content');
    if (stepContent) {
      stepContent.setAttribute('title', step.title);
      stepContent.setAttribute('description', step.description);
      stepContent.setAttribute('illustration', step.illustration);
      
      // Pass the current step number and total steps
      const currentStepId = this.game?.tutorial.getCurrentStepId() || '';
      const stepNumber = this.stepProvider.getStepNumber(currentStepId);
      const totalSteps = this.stepProvider.getTotalStepCount();
      
      stepContent.setAttribute('current-step', stepNumber.toString());
      stepContent.setAttribute('total-steps', totalSteps.toString());
    }
  }
  
  /**
   * Update the navigation component
   */
  private updateNavigation(stepId: string): void {
    const navigation = this.shadowRoot?.querySelector('tutorial-navigation');
    if (navigation) {
      // Get all the information from the provider
      const stepNumber = this.stepProvider.getStepNumber(stepId);
      const totalSteps = this.stepProvider.getTotalStepCount();
      const isFirstStep = this.stepProvider.isFirstStep(stepId);
      const isLastStep = this.stepProvider.isLastStep(stepId);
      
      // Update navigation properties
      navigation.setAttribute('current-step', stepNumber.toString());
      navigation.setAttribute('total-steps', totalSteps.toString());
      navigation.setAttribute('is-first-step', isFirstStep.toString());
      navigation.setAttribute('is-last-step', isLastStep.toString());
      navigation.setAttribute('next-disabled', 'false');
    }
  }
  
  /**
   * Set up event listeners for all components
   */
  protected setupEventListeners(): void {
    if (!this.shadowRoot) return;
    
    this.manageEventListeners('add');
  }
  
  /**
   * Clean up event listeners
   */
  protected cleanupEventListeners(): void {
    if (!this.shadowRoot) return;
    
    this.manageEventListeners('remove');
  }
  
  /**
   * Centralized method to manage event listeners
   * @param action Whether to add or remove event listeners
   */
  private manageEventListeners(action: 'add' | 'remove'): void {
    const method = action === 'add' ? 'addEventListener' : 'removeEventListener';
    
    // Handle navigation events
    const navigationElement = this.shadowRoot?.querySelector('tutorial-navigation');
    if (navigationElement) {
      navigationElement[method]('next', this.handleNext.bind(this));
      navigationElement[method]('previous', this.handlePrevious.bind(this));
      navigationElement[method]('finish', this.handleClose.bind(this));
    }
    
    // Handle close button events
    const closeButton = this.shadowRoot?.querySelector('close-button');
    if (closeButton) {
      closeButton[method]('close', this.handleClose.bind(this));
    }
  }
  
  /**
   * Handle closing the tutorial page
   */
  private handleClose(): void {
    if (this.game) {
      this.game.router.close();
    }
  }
  
  /**
   * Handle route params change
   */
  protected handleRouteParamsChange(paramsString: string): void {
    const params = new URLSearchParams(paramsString);
    
    // Check if a specific step ID was provided
    const stepId = params.get('step');
    if (stepId && this.game) {
      this.game.tutorial.navigateToStep(stepId);
    }
  }
  
  /**
   * Handle completion of the current tutorial step
   */
  private handleNext(): void {
    if (!this.game) return;
    
    this.game.tutorial.next();
    this.updateUI();
  }
  
  /**
   * Handle back button click
   */
  private handlePrevious(): void {
    if (!this.game) return;
    
    this.game.tutorial.previous();
    this.updateUI();
  }
  
  /**
   * Handle game state changes
   */
  private handleStateChange(state: GameState): void {
    this.updateUI();
  }
}

customElements.define("tutorial-page", TutorialPage);