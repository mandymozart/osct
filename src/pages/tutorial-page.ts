import { TutorialStep } from "../store";
import { Page } from "./page";

// Define step types
type StepType = "info" | "task";

// Define step content interface
interface StepContent {
  title: string;
  description: string;
  illustration: string;
  type: StepType;
}

// Define step state interface
interface StepState {
  taskCompleted?: boolean;
  next?: string;
  skip?: string;
}

// Step content - separated from state
const tutorialContent: Record<string, StepContent> = {
  "step-1": {
    title: "Welcome to the VR Experience",
    description: "Get ready to explore a new world of virtual reality. This tutorial will guide you through the basics.",
    illustration: "/assets/illustrations/welcome.svg",
    type: "info",
  },
  "step-2": {
    title: "Using the Controllers",
    description: "Learn how to use the VR controllers to interact with objects in the virtual environment.",
    illustration: "/assets/illustrations/controllers.svg",
    type: "info",
  },
  "step-3": {
    title: "Movement in VR",
    description: "Learn how to move around in the virtual space using teleportation and smooth locomotion.",
    illustration: "/assets/illustrations/movement.svg",
    type: "task",
  },
  "step-4": {
    title: "Interacting with Objects",
    description: "Discover how to grab, throw, and manipulate objects in the virtual world.",
    illustration: "/assets/illustrations/interaction.svg",
    type: "task",
  },
  "step-5": {
    title: "Advanced Features",
    description: "Explore advanced features like voice commands and multiplayer interactions.",
    illustration: "/assets/illustrations/advanced.svg",
    type: "info",
  },
  "complete": {
    title: "Tutorial Complete!",
    description: "You're now ready to enjoy the full VR experience. Have fun!",
    illustration: "/assets/illustrations/complete.svg",
    type: "info",
  },
};

// Step state - navigation and completion state
const initialStepStates: Record<string, StepState> = {
  "step-1": {
    next: "step-2",
  },
  "step-2": {
    next: "step-3",
  },
  "step-3": {
    taskCompleted: false,
    next: "step-4",
    skip: "step-4",
  },
  "step-4": {
    taskCompleted: false,
    next: "step-5",
    skip: "step-5",
  },
  "step-5": {
    next: "complete",
  },
  "complete": {},
};

export class TutorialPage extends Page {
  private currentStepId: string = "step-1";
  private stepContent: Record<string, StepContent> = tutorialContent;
  private stepStates: Record<string, StepState> = JSON.parse(JSON.stringify(initialStepStates));
  
  private contentElement: HTMLElement | null = null;
  private navigationElement: HTMLElement | null = null;
  private taskOverlayElement: HTMLElement | null = null;

  protected get styles(): string {
    return /* css */ `
      .content {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        box-sizing: border-box;
      }

      .tutorial-content {
        max-width: 800px;
        text-align: center;
      }

      .illustration {
        max-width: 80%;
        max-height: 400px;
        margin: 0 auto 2rem;
      }

      .title {
        font-size: 2rem;
        margin-bottom: 1rem;
      }

      .description {
        font-size: 1.2rem;
        line-height: 1.6;
        margin-bottom: 2rem;
      }

      .navigation {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        padding: 1rem 2rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: rgba(0, 0, 0, 0.1);
        box-sizing: border-box;
      }

      .nav-buttons {
        display: flex;
        gap: 1rem;
      }

      .button {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
        font-weight: bold;
        transition: background-color 0.2s;
      }

      .button-primary {
        background-color: #4285f4;
        color: white;
      }

      .button-secondary {
        background-color: #f1f1f1;
        color: #333;
      }

      .button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .step-indicators {
        display: flex;
        gap: 0.5rem;
      }

      .step-indicator {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: #ccc;
      }

      .step-indicator.active {
        background-color: #4285f4;
      }

      .task-overlay {
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        width: 100%;
        max-width: 600px;
        padding: 1.5rem;
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        border-radius: 8px;
        display: none;
      }

      .task-overlay.visible {
        display: block;
      }

      .task-title {
        font-size: 1.5rem;
        margin-bottom: 1rem;
      }

      .task-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 1.5rem;
      }

      .task-checkbox {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
      }

      .checkbox {
        width: 20px;
        height: 20px;
        border: 2px solid white;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .checkbox.checked::after {
        content: "✓";
        color: white;
        font-weight: bold;
      }
    `;
  }

  protected get template(): string {
    return `
      <div class="content">
        <div class="tutorial-content"></div>
        <div class="task-overlay">
          <div class="task-title">Complete this task</div>
          <div class="task-description"></div>
          <div class="task-actions">
            <label class="task-checkbox">
              <div class="checkbox"></div>
              <span>Mark as completed</span>
            </label>
            <button class="button button-secondary skip-task-button">Skip task</button>
          </div>
        </div>
        <div class="navigation">
          <div class="step-indicators"></div>
          <div class="nav-buttons">
            <button class="button button-secondary previous-button">Previous</button>
            <button class="button button-primary next-button">Continue</button>
          </div>
        </div>
      </div>
    `;
  }

  constructor() {
    super();
    this.currentStepId = "step-1";
  }

  connectedCallback() {
    super.connectedCallback();
    this.initializeElements();
    
    // Process any initial route params that might be set
    const routeParams = this.getAttribute('route-params');
    if (routeParams) {
      this.handleRouteParamsChange(routeParams);
    }
    
    this.renderStep();
  }

  /**
   * Override the handleRouteParamsChange method from the base class
   * to implement tutorial-specific routing behavior
   */
  protected handleRouteParamsChange(paramsJson: string): void {
    try {
      const params = JSON.parse(paramsJson);
      for (const param of params) {
        if (param.key === 'step' && param.value) {
          // Handle different formats: "step2", "step-2", "2"
          let stepId = param.value;
          
          // If just a number is provided
          if (/^\d+$/.test(stepId)) {
            stepId = `step-${stepId}`;
          }
          // If format is "step2", convert to "step-2"
          else if (/^step\d+$/.test(stepId)) {
            const num = stepId.replace('step', '');
            stepId = `step-${num}`;
          }
          
          // Verify the step exists before navigating
          if (this.stepContent[stepId]) {
            this.currentStepId = stepId;
            console.log(`Tutorial: Navigating to step ${stepId}`);
            
            // Re-render if component is already connected to DOM
            if (this.shadowRoot && this.contentElement) {
              this.renderStep();
            }
          } else {
            console.warn(`Tutorial: Requested step ${stepId} not found`);
          }
          break;
        }
      }
    } catch (error) {
      console.error('Tutorial: Error parsing route params', error);
    }
  }

  protected initializeElements(): void {
    this.contentElement = this.shadowRoot?.querySelector('.tutorial-content') as HTMLElement;
    this.navigationElement = this.shadowRoot?.querySelector('.navigation') as HTMLElement;
    this.taskOverlayElement = this.shadowRoot?.querySelector('.task-overlay') as HTMLElement;
    
    // Create step indicators
    const stepsCount = Object.keys(this.stepContent).length - 1; // Exclude 'complete'
    const indicatorsContainer = this.shadowRoot?.querySelector('.step-indicators');
    
    if (indicatorsContainer) {
      for (let i = 0; i < stepsCount; i++) {
        const indicator = document.createElement('div');
        indicator.classList.add('step-indicator');
        if (i === 0) indicator.classList.add('active');
        indicatorsContainer.appendChild(indicator);
      }
    }
  }

  protected setupEventListeners(): void {
    // Next button
    const nextButton = this.shadowRoot?.querySelector('.next-button');
    if (nextButton) {
      nextButton.addEventListener('click', () => this.next());
    }

    // Previous button
    const previousButton = this.shadowRoot?.querySelector('.previous-button');
    if (previousButton) {
      previousButton.addEventListener('click', () => this.previous());
    }

    // Skip task button
    const skipTaskButton = this.shadowRoot?.querySelector('.skip-task-button');
    if (skipTaskButton) {
      skipTaskButton.addEventListener('click', () => this.skip());
    }

    // Task checkbox
    const taskCheckbox = this.shadowRoot?.querySelector('.checkbox');
    if (taskCheckbox) {
      taskCheckbox.addEventListener('click', () => this.completeTask());
    }
  }
  
  protected cleanupEventListeners(): void {
    const nextButton = this.shadowRoot?.querySelector('.next-button');
    if (nextButton) {
      nextButton.removeEventListener('click', () => this.next());
    }

    const previousButton = this.shadowRoot?.querySelector('.previous-button');
    if (previousButton) {
      previousButton.removeEventListener('click', () => this.previous());
    }

    const skipTaskButton = this.shadowRoot?.querySelector('.skip-task-button');
    if (skipTaskButton) {
      skipTaskButton.removeEventListener('click', () => this.skip());
    }

    const taskCheckbox = this.shadowRoot?.querySelector('.checkbox');
    if (taskCheckbox) {
      taskCheckbox.removeEventListener('click', () => this.completeTask());
    }
  }

  protected renderStep(): void {
    const content = this.stepContent[this.currentStepId];
    const state = this.stepStates[this.currentStepId];
    
    if (!this.contentElement) return;
    
    // Update content
    this.contentElement.innerHTML = `
      <img class="illustration" src="${content.illustration}" alt="${content.title}" />
      <h2 class="title">${content.title}</h2>
      <p class="description">${content.description}</p>
    `;

    // Update step indicators
    const stepNumber = this.currentStepId.includes('step') 
      ? parseInt(this.currentStepId.split('-')[1]) 
      : Object.keys(this.stepContent).length;
    
    const indicators = this.shadowRoot?.querySelectorAll('.step-indicator');
    if (indicators) {
      indicators.forEach((indicator, index) => {
        indicator.classList.toggle('active', index + 1 === stepNumber);
      });
    }

    // Update navigation buttons
    const previousButton = this.shadowRoot?.querySelector('.previous-button') as HTMLButtonElement;
    const nextButton = this.shadowRoot?.querySelector('.next-button') as HTMLButtonElement;
    
    if (previousButton) {
      previousButton.disabled = stepNumber === 1;
    }
    
    if (nextButton) {
      const isTaskNotCompleted = content.type === 'task' && !state.taskCompleted;
      nextButton.disabled = isTaskNotCompleted;
      nextButton.textContent = this.currentStepId === 'step-5' ? 'Finish' : 'Continue';
      nextButton.style.display = this.currentStepId === 'complete' ? 'none' : 'block';
    }

    // Show/hide task overlay
    if (this.taskOverlayElement) {
      if (content.type === 'task') {
        this.taskOverlayElement.classList.add('visible');
        const taskDescription = this.taskOverlayElement.querySelector('.task-description');
        if (taskDescription) {
          taskDescription.textContent = `Try to ${content.description.toLowerCase()}`;
        }
        
        const checkbox = this.taskOverlayElement.querySelector('.checkbox');
        if (checkbox) {
          checkbox.classList.toggle('checked', !!state.taskCompleted);
        }
      } else {
        this.taskOverlayElement.classList.remove('visible');
      }
    }
  }

  protected previous(): void {
    const stepNumber = parseInt(this.currentStepId.split('-')[1]);
    if (stepNumber > 1) {
      this.currentStepId = `step-${stepNumber - 1}`;
      this.renderStep();
    }
  }

  protected next(): void {
    const state = this.stepStates[this.currentStepId];
    
    if (state.next) {
      this.currentStepId = state.next;
      this.renderStep();
    }
  }

  protected skip(): void {
    const state = this.stepStates[this.currentStepId];
    
    if (state.skip) {
      this.currentStepId = state.skip;
      this.renderStep();
    }
  }

  protected completeTask(): void {
    const content = this.stepContent[this.currentStepId];
    const state = this.stepStates[this.currentStepId];
    
    if (content.type === 'task') {
      // Toggle task completed state
      state.taskCompleted = !state.taskCompleted;
      
      // Update checkbox UI
      const checkbox = this.shadowRoot?.querySelector('.checkbox');
      if (checkbox) {
        checkbox.classList.toggle('checked', !!state.taskCompleted);
      }
      
      // Enable/disable next button
      const nextButton = this.shadowRoot?.querySelector('.next-button') as HTMLButtonElement;
      if (nextButton) {
        nextButton.disabled = !state.taskCompleted;
      }
    }
  }
}

customElements.define("tutorial-page", TutorialPage);