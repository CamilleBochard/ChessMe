// Checks that the yardsticks the site ships still describe what it serves.
// Serving another model, or searching to another depth, without writing the
// yardsticks again would set the Bot against figures measured on something
// else; these tests fail first.

import { describe, expect, it } from 'vitest';
import { ANALYSIS_DEPTH } from '../analysis/browser-engine';
import { SERVED_MODEL_RATING, SERVED_MODEL_SOURCE } from '../engine/served-model';
import improbabilityFile from './improbability-yardstick.json';
import lossFile from './loss-yardstick.json';

describe('the yardsticks the site ships', () => {
  it('read improbability with the model the site serves, at the rating it plays at', () => {
    expect(improbabilityFile.baseModel).toBe(SERVED_MODEL_SOURCE);
    expect(improbabilityFile.rating).toBe(SERVED_MODEL_RATING);
  });

  it('read losses with the build of Stockfish analysis mode runs, at the depth it searches to', () => {
    expect(lossFile.engine).toBe('Stockfish 19 Lite WASM');
    expect(lossFile.depth).toBe(ANALYSIS_DEPTH);
  });
});
