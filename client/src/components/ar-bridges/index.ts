// <ar-bridge>: the one bridge between the game state and the AR scene (./ar)
export * from "./ar-bridge";
// Tracking engine choice (MindAR / 8th Wall comparison) – read by the scene, switched in the debug overlay
export { cyclePreparedSpreadRange, getPreparedSpreadRange, getTrackerEngine, setTrackerEngine } from "./utils";
