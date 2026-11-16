# Card flight sandbox

A dev-only page to watch and time the marginalia card (#285): the picture lifts off the page as a stiff playing card,
turns over once and lands dead centre. It runs the engine's own `CardFlight` (`engine/src/scene/card-flight.ts`);
only the page's pose is simulated. No part of the reader's or the editor's build.

## Run

From the repository root (after `npm ci` in `client/`):

```bash
node client/node_modules/vite/bin/vite.js --config sandbox/card-flight/vite.config.mjs
```

Then open http://localhost:5181 (a phone: `adb reverse tcp:5181 tcp:5181`). **Fly** starts a flight; the sliders
set the flight's length and the page's distance and tilt, **Hand shake** moves the page like a hand-held phone does,
so the tracking's jitter during the flight can be judged.

| The same as in the reader | Simulated |
|---|---|
| `CardFlight`: path, turn, end distance, the default back, render order | The page: a sheet with the fixture picture, its pose from the sliders |
| Camera at the origin, the anchor's pose relative to it, 1 unit = the picture's width | The field of view: fixed 60° vertical |
