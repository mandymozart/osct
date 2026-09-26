// The AR scene and its building blocks – the only code that touches three.js / MindAR.
// Loaded lazily (`import("./ar")` in lazy-ar-scene.ts): three + MindAR (TF.js) form their own chunk.
export * from "./ar-scene";
export * from "./entities";
