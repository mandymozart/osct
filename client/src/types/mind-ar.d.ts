// MindAR Image Tracking TypeScript Definitions

declare namespace AFRAME {
  // Extend the existing AFrame namespace

  // System Definition
  interface Systems {
    "mindar-image-system": MindARImageSystem;
  }

  // Component Definitions
  interface Components {
    "mindar-image": MindARImageComponent;
    "mindar-image-target": MindARImageTargetComponent;
  }

  // MindAR Image System
  interface MindARImageSystem {
    container: HTMLElement | null;
    video: HTMLVideoElement | null;
    processingImage: boolean;
    anchorEntities: Array<{
      el: MindARImageTargetComponent;
      targetIndex: number;
    }>;
    imageTargetSrc: string;
    maxTrack: number;
    filterMinCF: number | null;
    filterBeta: number | null;
    missTolerance: number | null;
    warmupTolerance: number | null;
    showStats: boolean;
    mainStats?: any; // Stats instance
    ui: any; // UI instance
    controller: any; // Controller instance

    // Methods
    setup(options: {
      imageTargetSrc: string;
      maxTrack: number;
      showStats: boolean;
      uiLoading: string;
      uiScanning: string;
      uiError: string;
      missTolerance?: number | null;
      warmupTolerance?: number | null;
      filterMinCF?: number | null;
      filterBeta?: number | null;
    }): void;

    registerAnchor(el: MindARImageTargetComponent, targetIndex: number): void;
    start(): void;
    switchTarget(targetIndex: number): void;
    stop(): void;
    pause(keepVideo?: boolean): void;
    unpause(): void;
  }

  // MindAR Image Component
  interface MindARImageComponent extends Component {
    data: {
      imageTargetSrc: string;
      maxTrack: number;
      filterMinCF: number;
      filterBeta: number;
      missTolerance: number;
      warmupTolerance: number;
      showStats: boolean;
      autoStart: boolean;
      uiLoading: string;
      uiScanning: string;
      uiError: string;
    };
  }

  // MindAR Image Target Component
  interface MindARImageTargetComponent extends Component {
    data: {
      targetIndex: number;
    };

    el: Entity;
    postMatrix: THREE.Matrix4 | null;
    invisibleMatrix: THREE.Matrix4;

    setupMarker(dimensions: [number, number]): void;
    updateWorldMatrix(worldMatrix: number[] | null): void;
  }

  // Extend Entity interface to include the new component
  interface Entity {
    components: {
      "mindar-image"?: MindARImageComponent;
      "mindar-image-target"?: MindARImageTargetComponent;
    };

    // Events emitted by mindar-image-target
    addEventListener(
      type: "targetFound",
      listener: (evt: CustomEvent) => void
    ): void;
    addEventListener(
      type: "targetLost",
      listener: (evt: CustomEvent) => void
    ): void;
    addEventListener(
      type: "targetUpdate",
      listener: (evt: CustomEvent) => void
    ): void;

    // Events emitted by the AR system
    addEventListener(
      type: "arReady",
      listener: (evt: CustomEvent) => void
    ): void;
    addEventListener(
      type: "arError",
      listener: (evt: CustomEvent & { error: string }) => void
    ): void;

    // Method added to Entity
    updateWorldMatrix?(worldMatrix: number[] | null): void;
  }

  // Controller and UI interfaces (based on imported modules)
  interface Controller {
    addImageTargets(
      imageTargetSrc: string
    ): Promise<{ dimensions: Array<[number, number]> }>;
    dummyRun(video: HTMLVideoElement): Promise<void>;
    getProjectionMatrix(): number[];
    processVideo(video: HTMLVideoElement): void;
    stopProcessVideo(): void;
    dispose(): void;
    interestedTargetIndex: number;
  }

  interface UI {
    showLoading(): void;
    hideLoading(): void;
    showScanning(): void;
    hideScanning(): void;
    showCompatibility(): void;
  }
}

// Usage example:
/*
  // In your TypeScript file:
  AFRAME.registerComponent('my-component', {
    dependencies: ['mindar-image-target'],
    
    init: function() {
      // Access the mindar-image-system
      const arSystem = this.el.sceneEl.systems['mindar-image-system'];
      
      // Listen for target events
      this.el.addEventListener('targetFound', () => {
        console.log('Target found');
      });
      
      this.el.addEventListener('targetLost', () => {
        console.log('Target lost');
      });
    }
  });
  */
