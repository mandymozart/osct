import { TutorialStep } from "../store";
import { Page } from "./page";

// TODO: Create step components and only handle the sequence here
const initialSteps = {
  "step-1": {
    next: "key-1",
    skip: "complete",
  },
  "step-2": {},
  "step-3": {},
  "step-4": {},
  "step-5": {},
  complete: {},
};

export class TutorialPage extends Page {
  private currentStep: TutorialStep;
  private steps: any;

  protected get styles(): string {
    return /* css */ ``;
  }

  protected get template(): string {
    return `
      <div class="content">
      <h2>Tutorial</h2>
      </div>
    `;
  }

  protected previous(): void {}
  protected next(): void {}
  protected skip(): void {}
  constructor() {
    super();
    this.steps = initialSteps;
    this.currentStep = initialSteps["step-1"];
  }
}

customElements.define("tutorial-page", TutorialPage);
