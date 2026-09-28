// The AR scene and its building blocks – the only code that touches three.js / the 8th Wall engine.
// Loaded lazily (`import("./ar")` in lazy-ar-scene.ts): three forms its own chunk; the engine's files load with
// the scene's first start (`prefetchXr8()` fetches them ahead into the HTTP cache).
export * from "./ar-scene";
export * from "./entities";
export { prefetchXr8 } from "./xr8";
