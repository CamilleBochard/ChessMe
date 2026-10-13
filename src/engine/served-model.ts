// The Base Model the site serves, as decided by the Base Model sweep
// (docs/experiments/base-model-sweep.md): Maia-3 5M at a rating of 1100,
// Camille's Maia-Equivalent Rating.

/** The converted model, as scripts/stage-model.ts finds it in models/onnx. */
export const SERVED_MODEL_SOURCE = 'models/onnx/maia3-5m.onnx';

/** Where the build serves it from. */
export const SERVED_MODEL_DIRECTORY = 'public/models';

/** The rating the Base Model plays at. */
export const SERVED_MODEL_RATING = 1100;

/**
 * The temperature the Bot draws the Base Model's move at. At 1 each move is
 * played as often as the model predicts a player at its rating would play it.
 * Of the temperatures measured, 1 brings the Bot's evaluation losses closest
 * to Camille's Blunder Profile (docs/experiments/draw-temperature.md).
 */
export const SERVED_MODEL_TEMPERATURE = 1;
