// Put this in a .d.ts file (e.g., aframe-extensions.d.ts)
import 'aframe';

// Declare the detail event interface if not already defined
declare global {
  interface DetailEvent<T> extends Event {
    detail: T;
  }
}

// Extend A-Frame's Entity Events
declare module "aframe" {
  // Add custom A-Frame events here
  export interface EntityEvents {
    // Standard A-Frame events
    "loaded": DetailEvent<{}>;
    "child-attached": DetailEvent<{el: Entity}>;
    
    // Asset-related events
    "asset-loaded": DetailEvent<{src: string}>;
    "asset-failed": DetailEvent<{src: string, error: Error}>;
    
    // Add your other custom events here
    // "eventname": DetailEvent<{degrees: number, source: Entity}>;
  }
}