import { CanvasTexture, Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Quaternion, Scene, SRGBColorSpace, type Texture, TextureLoader, Vector3, WebGLRenderer } from "three";
import { CARD_HOLD_MS, CardFlight } from "@engine/scene/card-flight";

/** A fixture's colour picture stands in for a glossary entry's own image; the printed target is made from it */
const PICTURE = new URL("../../../fixtures/content/entries/metafiction/metafiction.jpg", import.meta.url).href;

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setClearColor(0x2a2622);
document.body.prepend(renderer.domElement);
const scene = new Scene();
// As the tracker's: at the origin, looking down −z
const camera = new PerspectiveCamera(60, 1, 0.01, 100);

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const show = (id: string, text: string) => ((document.getElementById(`${id}-out`) as HTMLOutputElement).value = text);

/** The page: an anchor group (1 unit = the picture's width, origin in its centre, +z out of the page) */
const page = new Group();
page.matrixAutoUpdate = false;
scene.add(page);
const sheet = new Mesh(new PlaneGeometry(2.4, 1.6), new MeshBasicMaterial({ color: 0xece4d4 }));
sheet.position.set(0.55, 0.1, -0.001);
page.add(sheet);
let aspect = 1;
const picture = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial());
page.add(picture);

const loader = new TextureLoader();
const loadPicture = () => loader.loadAsync(PICTURE).then(texture => {
  texture.colorSpace = SRGBColorSpace;
  return texture;
});
/** The picture as the page prints it: small, grey, a little faded – the target the card flies as */
const printed = (picture: Texture): Texture => {
  const image = picture.image as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = Math.round((180 * image.height) / image.width);
  const g = canvas.getContext("2d");
  if (g) {
    g.filter = "grayscale(1) contrast(.85) brightness(1.05)";
    g.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};
void loadPicture().then(colour => {
  const texture = printed(colour);
  const image = texture.image as { width: number; height: number };
  aspect = image.height / image.width;
  picture.scale.y = aspect;
  const material = picture.material as MeshBasicMaterial;
  material.map = texture;
  material.needsUpdate = true;
});

/** The page's pose: in front of and below the camera, tilted towards it; the hand shake adds a small wobble */
const anchorMatrix = (time: number): Matrix4 => {
  const distance = Number(input("distance").value);
  const tilt = (Number(input("tilt").value) * Math.PI) / 180;
  const shake = input("shake").checked ? 1 : 0;
  const wobble = new Vector3(Math.sin(time * 2.1) * 0.012, Math.sin(time * 2.9 + 1) * 0.01, Math.sin(time * 1.7) * 0.015)
    .multiplyScalar(shake * distance);
  const position = new Vector3(0, -0.25 * distance, -distance).add(wobble);
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -tilt)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), shake * Math.sin(time * 1.3) * 0.03));
  return new Matrix4().compose(position, rotation, new Vector3(0.5, 0.5, 0.5));
};

let flight: CardFlight | null = null;
document.getElementById("fly")?.addEventListener("click", () => {
  frozen = false; // a still (`cardAt`) stopped the loop
  flight?.dispose();
  flight = null;
  void loadPicture().then(front => {
    flight = new CardFlight(page.matrix, printed(front), aspect, null, Number(input("length").value) || null, front);
    scene.add(flight.object);
    picture.visible = false;
  });
});

const resize = () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
};
window.addEventListener("resize", resize);
resize();

/**
 * For stills (a hidden tab's frames are throttled): `cardAt(t)` shows the flight at `t` (0…1) and stops the loop;
 * `cardAt(null)` lets it run again.
 */
let frozen = false;
(window as unknown as { cardAt: (t: number | null) => Promise<void> }).cardAt = async (t: number | null) => {
  frozen = t !== null;
  if (t === null) return;
  const front = await loadPicture();
  flight?.dispose();
  page.matrix.copy(anchorMatrix(0));
  camera.updateMatrixWorld();
  const length = Number(input("length").value);
  const still = new CardFlight(page.matrix, printed(front), aspect, null, length || null, front);
  scene.add(still.object);
  still.update(0, page.matrix, camera); // sets the length from the page's distance when it is auto
  still.update((t * still.length) / 1000, page.matrix, camera);
  picture.visible = false;
  renderer.render(scene, camera);
  flight = null;
  window.setTimeout(() => still.dispose(), 0);
};

let last = performance.now();
renderer.setAnimationLoop(now => {
  const delta = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (frozen) return;
  const auto = flight?.length;
  show("length", Number(input("length").value) ? `${(Number(input("length").value) / 1000).toFixed(1)} s` : `auto${auto ? ` ${(auto / 1000).toFixed(2)} s` : ""}`);
  show("distance", input("distance").value);
  show("tilt", `${input("tilt").value}°`);
  page.matrix.copy(anchorMatrix(now / 1000));
  page.matrixWorldNeedsUpdate = true;
  camera.updateMatrixWorld();
  const current = flight;
  if (current && !current.update(delta, page.matrix, camera)) {
    flight = null;
    // In the reader the entry opens over the card now; here it stays a moment, then the page shows the picture again
    window.setTimeout(() => {
      current.dispose();
      picture.visible = true;
    }, CARD_HOLD_MS + 700);
  }
  renderer.render(scene, camera);
});
