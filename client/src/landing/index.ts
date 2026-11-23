// The landing as a piece (#355): what another page needs to mount it with data of its own. The page's entry (entry.ts)
// is loaded by index.html, never through this barrel; the hero (hero.ts, three.js) is loaded lazily by mount.ts.
export * from "./data";
export * from "./desktop-visitor";
export * from "./landing-config";
export * from "./links";
export * from "./mount";
export * from "./texts";
