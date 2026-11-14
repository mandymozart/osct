import { DEFAULT_REVEAL, type RevealParams } from "./params";

/**
 * The concepts to compare. `engine` is the reader's animation as shipped (the engine's `celebrate`); every other one is
 * a starting point of the sandbox's own animation – its values over the defaults – that the panel tunes from there.
 */

export const ENGINE_CONCEPT = "engine";

export interface Concept {
  id: string;
  name: string;
  about: string;
  params: Partial<RevealParams>;
}

export const CONCEPTS: Concept[] = [
  {
    id: ENGINE_CONCEPT,
    name: "As shipped",
    about: "The reader's animation: the engine's own code and looks – a find plays the look, losing the page plays it rewound. The values are the engine's.",
    params: {},
  },
  {
    id: "inflate",
    name: "Inflate",
    about: "The mesh lies flat on the page and rises to its height: the page normal from 0 to 1.",
    params: { heightFrom: 0, shapeEase: "out", duration: 700, outDuration: 450 },
  },
  {
    id: "inflate-bounce",
    name: "Inflate, overshoot",
    about: "The same, a little too tall for a moment before it settles.",
    params: { heightFrom: 0, shapeEase: "back", overshoot: 1.4, duration: 800, outDuration: 450 },
  },
  {
    id: "inflate-wave",
    name: "Inflate wave",
    about: "Rises from the centre outwards: every vertex inflates a little later the further it is from the middle.",
    params: { heightFrom: 0, shapeEase: "out", stagger: 0.7, staggerBy: "radial", duration: 1100, outDuration: 600 },
  },
  {
    id: "print-lift",
    name: "Print lifts off",
    about: "Starts as a pale print on the paper, then lifts off the page and takes its colours.",
    params: { heightFrom: 0, shapeStart: 0.2, shapeEase: "inOut", fade: 0.15, tint: 0.85, tintColor: "#f5e7c8", tintEnd: 0.7, duration: 1100, outDuration: 600 },
  },
  {
    id: "inflate-dissolve",
    name: "Inflate + dissolve",
    about: "Flat and small on the page, it rises, grows and turns half around under the noise dissolve with a gold edge and sparks – the engine's default look.",
    params: {
      heightFrom: 0, scaleFrom: 0, spin: -0.5, shapeEase: "out", shapeEnd: 0.8, mask: "noise", maskInvert: true, maskEnd: 0.75, edgeStart: 0.06, edgeEnd: 0.015,
      edgeIntensity: 0.6, glow: 0.6, glowWidth: 0.2, sparks: 300, duration: 3470, outDuration: 600,
    },
  },
  {
    id: "rise",
    name: "Rising line",
    about: "A glowing line climbs from the page and leaves the entity behind it.",
    params: { mask: "rise", maskNoise: 0.12, maskEase: "inOut", edgeStart: 0.03, edgeEnd: 0.03, edgeIntensity: 1.6, glow: 0.5, glowWidth: 0.15, bloom: 0.5, duration: 900, outDuration: 600 },
  },
  {
    id: "radial",
    name: "From the centre",
    about: "Spreads from the middle of the page outwards, like ink.",
    params: { mask: "radial", maskNoise: 0.35, maskEase: "out", edgeStart: 0.05, edgeEnd: 0.01, duration: 900, outDuration: 600 },
  },
  {
    id: "dissolve",
    name: "Dissolve",
    about: "The noise dissolve as a sandbox concept: the shipped reveal's look with every value open.",
    params: { mask: "noise", waves: 3, duration: 600, outDuration: 700 },
  },
  {
    id: "dither",
    name: "Dither fade",
    about: "A fade without transparency: pixels switch on in a screen pattern. The cheapest on a phone.",
    params: { mask: "dither", maskEase: "linear", duration: 450, outDuration: 350 },
  },
  {
    id: "fade",
    name: "Fade",
    about: "Fades in, fades out. Real transparency: a model shows through itself a little while it fades.",
    params: { fade: 1, duration: 600, outDuration: 400 },
  },
  {
    id: "pop",
    name: "Pop",
    about: "Grows from a smaller size with a small overshoot while it fades in.",
    params: { scaleFrom: 0.6, shapeEase: "back", overshoot: 1.2, fade: 0.35, duration: 450, outDuration: 300 },
  },
  {
    id: "gold-inflate",
    name: "Gold inflate",
    about: "A first-find candidate: the line climbs in gold with sparks and bloom while the mesh inflates.",
    params: {
      heightFrom: 0, shapeEase: "out", shapeEnd: 0.6, mask: "rise", maskNoise: 0.25, maskEnd: 0.7, edgeStart: 0.08, edgeEnd: 0.02, edgeIntensity: 1.5,
      glow: 0.8, glowWidth: 0.3, sparks: 500, bloom: 0.35, duration: 2400, outDuration: 700,
    },
  },
];

export const conceptDefaults = (id: string): RevealParams => ({ ...DEFAULT_REVEAL, ...(CONCEPTS.find(concept => concept.id === id)?.params ?? {}) });
