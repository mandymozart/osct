import { AmbientLight, Clock, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from "three";

/**
 * The three.js side of the AR scene: one WebGL renderer (one context for the session), scene, camera,
 * lights and the render loop. The canvas (`#scene`, main.css fades it in while AR runs) lies over the
 * camera video, transparent.
 */
export class ArView {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera();
  readonly renderer: WebGLRenderer;
  private clock = new Clock();
  private frameListeners = new Set<(delta: number) => void>();
  private looping = false;

  constructor(private container: HTMLElement, private onResize: (camera: PerspectiveCamera) => void) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    canvas.id = "scene";
    Object.assign(canvas.style, { position: "absolute", left: "0", top: "0" });
    container.appendChild(canvas);

    // A-Frame's default lights (the models were made for them): ambient #BBB, directional 0.6 from above left
    this.scene.add(new AmbientLight(0xbbbbbb, 1));
    const sun = new DirectionalLight(0xffffff, 0.6);
    sun.position.set(-0.5, 1, 1);
    this.scene.add(sun);

    window.addEventListener("resize", this.resize);
    this.resize();
  }

  /** Called every rendered frame with the seconds since the last one */
  onFrame(listener: (delta: number) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  get running(): boolean {
    return this.looping;
  }

  start(): void {
    if (this.running) return;
    this.clock.getDelta(); // no jump after a pause
    this.looping = true;
    this.renderer.setAnimationLoop(() => {
      const delta = this.clock.getDelta();
      this.frameListeners.forEach(listener => listener(delta));
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Stop rendering – the canvas keeps the last frame */
  stop(): void {
    this.looping = false;
    this.renderer.setAnimationLoop(null);
  }

  resize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.onResize(this.camera); // the tracker fits video + field of view
    this.camera.updateProjectionMatrix();
    if (!this.running) this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.stop();
    window.removeEventListener("resize", this.resize);
    this.frameListeners.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
