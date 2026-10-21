// The Base Model the site serves and how its move is drawn. The Base Model
// sweep (docs/experiments/base-model-sweep.md) chose Maia-3 5M at a rating of
// 1100, Camille's Maia-Equivalent Rating; the model served is that network
// fine-tuned on his training games, chosen with its temperature and its
// opening cut in docs/experiments/model-choice-on-open-positions.md.

import type { MoveCut } from './move-cut';

/**
 * The converted model, as scripts/stage-model.ts finds it in models/onnx.
 * pipeline/recreate_fine_tuned.py trains it again from the repository, and
 * pipeline/convert_maia3.py converts it.
 */
export const SERVED_MODEL_SOURCE = 'models/onnx/maia3-5m-fine-tuned.onnx';

/** The model's name, as the experiments' results record it. */
export const SERVED_MODEL_NAME = 'maia3-5m-fine-tuned';

/** Where the build serves it from. */
export const SERVED_MODEL_DIRECTORY = 'public/models';

/** The rating the Base Model plays at. */
export const SERVED_MODEL_RATING = 1100;

/**
 * The temperature the Bot draws the Base Model's move at. At 1 each move is
 * played as often as the model predicts a player at its rating would play it.
 * Of the temperatures measured, 1 brings the Bot's evaluation losses in open
 * positions closest to Camille's (docs/experiments/level-on-open-positions.md).
 */
export const SERVED_MODEL_TEMPERATURE = 1;

/**
 * In the opening, the Bot draws among the model's ten most likely moves only.
 * Without it the Bot plays moves the model gives less than 1% more often than
 * Camille does there (docs/experiments/move-cut.md); with it, it comes closer
 * to his share at no cost to Move-Matching
 * (docs/experiments/model-choice-on-open-positions.md).
 */
export const SERVED_OPENING_CUT: MoveCut = { kind: 'top-k', k: 10 };
