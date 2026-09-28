// The AR scene and its building blocks – the only code that touches three.js / MindAR / 8th Wall.
// Loaded lazily (`import("./ar")` in lazy-ar-scene.ts): three forms its own chunk; the tracking engine
// (MindAR with TF.js, or 8th Wall) loads with the scene's first start or `preloadImageTracker()`.
export * from "./ar-scene";
export * from "./entities";
export { preloadImageTracker } from "./create-tracker";
